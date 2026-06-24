import { create } from 'zustand';

export interface Collaborator {
  userId: string;
  name: string;
  socketId: string;
  color: string;
  cursor?: { x: number; y: number } | null;
}

interface CollaborationState {
  collaborators: Map<string, Collaborator>;
  setCollaborators: (users: Map<string, Collaborator>) => void;
  addCollaborator: (user: Omit<Collaborator, 'color'>) => void;
  removeCollaborator: (socketId: string) => void;
  updateCursor: (socketId: string, position: { x: number; y: number } | null) => void;
  clearCollaborators: () => void;
}

const COLLABORATOR_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#34d399', 
  '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#f472b6'
];

export const useCollaborationStore = create<CollaborationState>((set) => ({
  collaborators: new Map<string, Collaborator>(),
  setCollaborators: (collaborators) => set({ collaborators }),
  addCollaborator: (user) => {
    set((state) => {
      const nextMap = new Map(state.collaborators);
      const colorIndex = Math.abs(user.userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % COLLABORATOR_COLORS.length;
      nextMap.set(user.socketId, {
        ...user,
        color: COLLABORATOR_COLORS[colorIndex],
      });
      return { collaborators: nextMap };
    });
  },
  removeCollaborator: (socketId) => {
    set((state) => {
      const nextMap = new Map(state.collaborators);
      nextMap.delete(socketId);
      return { collaborators: nextMap };
    });
  },
  updateCursor: (socketId, position) => {
    set((state) => {
      const nextMap = new Map(state.collaborators);
      const collab = nextMap.get(socketId);
      if (collab) {
        nextMap.set(socketId, { ...collab, cursor: position });
      }
      return { collaborators: nextMap };
    });
  },
  clearCollaborators: () => set({ collaborators: new Map() }),
}));
