import { io, Socket } from 'socket.io-client';
import { useCollaborationStore } from '../stores/collaborationStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = localStorage.getItem('accessToken');
    
    socket = io(WS_URL, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket'],
    });

    // Setup global listeners
    socket.on('user-joined', (user) => {
      useCollaborationStore.getState().addCollaborator(user);
    });

    socket.on('user-left', (user) => {
      useCollaborationStore.getState().removeCollaborator(user.socketId);
    });

    socket.on('cursor-update', (data) => {
      useCollaborationStore.getState().updateCursor(data.socketId, { x: data.x, y: data.y });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    socket.on('disconnect', () => {
      useCollaborationStore.getState().clearCollaborators();
    });
  }
  return socket;
};

export const connectSocket = (boardId: string) => {
  const s = getSocket();
  if (!s.connected) {
    // Re-verify auth handshake token state
    const token = localStorage.getItem('accessToken');
    s.auth = { token };
    s.connect();
  }
  
  s.emit('join-room', boardId);

  s.once('room-joined', (data) => {
    const collabsMap = new Map();
    data.activeUsers.forEach((user: any) => {
      collabsMap.set(user.socketId, {
        userId: user.userId,
        name: user.name,
        socketId: user.socketId,
        color: '#ccc', // Will auto resolve in addCollaborator
      });
    });
    useCollaborationStore.getState().setCollaborators(collabsMap);
  });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    useCollaborationStore.getState().clearCollaborators();
  }
};

export const emitCursorMove = (coords: { x: number; y: number }) => {
  if (socket && socket.connected) {
    socket.emit('cursor-move', coords);
  }
};
