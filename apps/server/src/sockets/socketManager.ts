import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/db';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { yjsRegistry } from './yjsStore';
import * as Y from 'yjs';

dotenv.config();

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email: string;
    role: string;
    name: string;
  };
  boardId?: string;
}

export const setupSocket = async (io: Server) => {
  // Setup Redis Adapter for multi-node scalability if REDIS_URL is provided
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.io Redis adapter connected successfully');
    } catch (err) {
      console.error('Failed to bind Socket.io Redis adapter:', err);
    }
  }

  // Middleware to authenticate Socket connection using JWT
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication failed: Token missing'));
    }

    try {
      const decoded = verifyAccessToken(token);
      
      // Fetch user profile details to populate avatar/name
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, email: true, role: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      };

      return next();
    } catch (error) {
      return next(new Error('Authentication failed: Token invalid or expired'));
    }
  });

  // Client events
  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) return;
    
    const currentUser = socket.user;
    console.log(`User connected: ${currentUser.name} (${socket.id})`);

    // 1. Join Room
    socket.on('join-room', async (boardId: string) => {
      try {
        // Validate user has permission to access the board
        const board = await prisma.board.findUnique({
          where: { id: boardId },
          include: { collaborators: true },
        });

        if (!board) {
          socket.emit('error', 'Board not found');
          return;
        }

        const isPublic = board.visibility === 'PUBLIC';
        const isCollaborator = board.collaborators.some((c: any) => c.userId === currentUser.userId);

        if (!isPublic && !isCollaborator && board.ownerId !== currentUser.userId) {
          socket.emit('error', 'Access denied to this board');
          return;
        }

        socket.boardId = boardId;
        socket.join(boardId);
        
        // Notify others in room
        socket.to(boardId).emit('user-joined', {
          userId: currentUser.userId,
          name: currentUser.name,
          socketId: socket.id,
        });

        // Send active users list to the joining user
        const clients = await io.in(boardId).fetchSockets();
        const activeUsers = (clients as any[])
          .filter((s) => s.id !== socket.id)
          .map((s) => ({
            userId: s.user?.userId,
            name: s.user?.name,
            socketId: s.id,
          }));

        // Load Yjs document and sync current state
        const ydoc = await yjsRegistry.getOrCreateDoc(boardId);
        const stateUpdate = Y.encodeStateAsUpdate(ydoc);

        socket.emit('room-joined', { boardId, activeUsers });
        socket.emit('yjs-sync', Buffer.from(stateUpdate));
      } catch (error) {
        console.error('Socket join-room error:', error);
        socket.emit('error', 'Failed to join whiteboard room');
      }
    });

    // 2. Cursor movement tracking
    socket.on('cursor-move', (coords: { x: number; y: number }) => {
      if (!socket.boardId) return;

      socket.to(socket.boardId).emit('cursor-update', {
        userId: currentUser.userId,
        name: currentUser.name,
        socketId: socket.id,
        x: coords.x,
        y: coords.y,
      });
    });

    // 3. Yjs CRDT Synchronization updates
    socket.on('yjs-update', async (update: Buffer) => {
      if (!socket.boardId) return;
      
      // Broadcast binary update to other active participants in the board room
      socket.to(socket.boardId).emit('yjs-update', update);
      
      // Persist incremental update in server Yjs state registry
      await yjsRegistry.applyUpdate(socket.boardId, new Uint8Array(update));
    });

    // 4. Element lock/unlock (To prevent write-conflicts in legacy elements)
    socket.on('element-lock', (elementId: string) => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('element-locked', {
        elementId,
        userId: currentUser.userId,
        name: currentUser.name,
      });
    });

    socket.on('element-unlock', (elementId: string) => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('element-unlocked', { elementId });
    });

    // 5. Drawing action backup (legacy drawing support)
    socket.on('draw-action', (action: any) => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('draw-action', action);
    });

    // 6. Comments notification
    socket.on('comment-added', (comment: any) => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('comment-added', comment);
    });

    // 7. Clear canvas
    socket.on('canvas-clear', () => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('canvas-clear');
    });

    // 8. WebRTC Audio Signaling Bridge
    socket.on('webrtc-signal', ({ to, signal }) => {
      io.to(to).emit('webrtc-signal', {
        from: socket.id,
        signal,
      });
    });

    // 9. Presentation Mode synchronization
    socket.on('presentation-action', (action: any) => {
      if (!socket.boardId) return;
      socket.to(socket.boardId).emit('presentation-action', action);
    });

    // Disconnect event handler
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${currentUser.name} (${socket.id})`);
      if (socket.boardId) {
        socket.to(socket.boardId).emit('user-left', {
          userId: currentUser.userId,
          name: currentUser.name,
          socketId: socket.id,
        });

        // Save and clear document memory cache if room becomes completely empty
        const targetBoardId = socket.boardId;
        setTimeout(async () => {
          const room = io.sockets.adapter.rooms.get(targetBoardId);
          if (!room || room.size === 0) {
            await yjsRegistry.clearDoc(targetBoardId);
          }
        }, 1000);
      }
    });
  });
};
