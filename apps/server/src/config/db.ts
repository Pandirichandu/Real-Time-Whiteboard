import { PrismaClient } from '@prisma/client';

let prisma: any;

if (process.env.NODE_ENV === 'test' || process.env.USE_MOCK_DB === 'true') {
  const mockDb = new Map<string, any[]>();
  prisma = {
    $connect: async () => { console.log('Mock DB connection active'); },
    $disconnect: async () => { console.log('Mock DB connection closed'); },
    user: {
      findUnique: async (args: any) => {
        const list = mockDb.get('user') || [];
        return list.find((u) => u.email === args.where?.email || u.id === args.where?.id) || null;
      },
      findFirst: async (args: any) => {
        const list = mockDb.get('user') || [];
        return list.find((u) => u.stripeSubscriptionId === args.where?.stripeSubscriptionId) || null;
      },
      create: async (args: any) => {
        const list = mockDb.get('user') || [];
        const newUser = { id: Math.random().toString(36).substring(7), plan: 'FREE', role: 'USER', ...args.data };
        list.push(newUser);
        mockDb.set('user', list);
        return newUser;
      },
      update: async (args: any) => {
        const list = mockDb.get('user') || [];
        const idx = list.findIndex((u) => u.id === args.where?.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...args.data };
          mockDb.set('user', list);
          return list[idx];
        }
        return null;
      },
      deleteMany: async () => {
        mockDb.set('user', []);
        return { count: 0 };
      }
    },
    board: {
      count: async (args: any) => {
        const list = mockDb.get('board') || [];
        return list.filter((b) => b.ownerId === args.where?.ownerId).length;
      },
      findFirst: async (args: any) => {
        const list = mockDb.get('board') || [];
        const board = list.find((b) => b.id === args?.where?.id) || null;
        if (board) {
          const colls = mockDb.get('collaborator') || [];
          let boardColls = colls.filter((c) => c.boardId === board.id);
          const filterUserId = args?.include?.collaborators?.where?.userId;
          if (filterUserId) {
            boardColls = boardColls.filter((c) => c.userId === filterUserId);
          }
          return {
            ...board,
            collaborators: boardColls,
          };
        }
        return null;
      },
      create: async (args: any) => {
        const list = mockDb.get('board') || [];
        const boardId = '11111111-2222-3333-4444-' + Math.random().toString(36).substring(2, 14).padEnd(12, 'a');
        const newBoard = {
          id: boardId,
          inviteCode: 'MOCK_INVITE',
          visibility: 'PRIVATE',
          isArchived: false,
          yjsState: null,
          ...args.data,
        };
        // Auto-extract collaborators if supplied in prisma relation format
        if (args.data.collaborators?.create) {
          const collsList = mockDb.get('collaborator') || [];
          const items = Array.isArray(args.data.collaborators.create)
            ? args.data.collaborators.create
            : [args.data.collaborators.create];
          items.forEach((item: any) => {
            collsList.push({
              id: Math.random().toString(36).substring(7),
              boardId,
              userId: item.userId || newBoard.ownerId,
              role: item.role || 'OWNER',
            });
          });
          mockDb.set('collaborator', collsList);
        }
        delete newBoard.collaborators;
        list.push(newBoard);
        mockDb.set('board', list);
        return newBoard;
      },
      findMany: async (args: any) => {
        const list = mockDb.get('board') || [];
        // Filter by user access
        const userId = args?.where?.OR?.[0]?.ownerId || args?.where?.OR?.[1]?.collaborators?.some?.userId;
        let filtered = list;
        if (userId) {
          const colls = mockDb.get('collaborator') || [];
          filtered = list.filter((b) => {
            if (b.ownerId === userId) return true;
            return colls.some((c) => c.boardId === b.id && c.userId === userId);
          });
        }
        // pagination
        const skip = args?.skip || 0;
        const take = args?.take || 20;
        return filtered.slice(skip, skip + take);
      },
      findUnique: async (args: any) => {
        const list = mockDb.get('board') || [];
        const board = list.find((b) => b.id === args.where?.id) || null;
        if (board) {
          // Include collaborators
          const colls = mockDb.get('collaborator') || [];
          let boardColls = colls.filter((c) => c.boardId === board.id);
          const filterUserId = args?.include?.collaborators?.where?.userId;
          if (filterUserId) {
            boardColls = boardColls.filter((c) => c.userId === filterUserId);
          }
          return {
            ...board,
            collaborators: boardColls,
          };
        }
        return null;
      },
      update: async (args: any) => {
        const list = mockDb.get('board') || [];
        const idx = list.findIndex((b) => b.id === args.where?.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...args.data };
          mockDb.set('board', list);
          return list[idx];
        }
        return null;
      },
      deleteMany: async () => {
        mockDb.set('board', []);
        mockDb.set('collaborator', []);
        return { count: 0 };
      }
    },
    boardCollaborator: {
      create: async (args: any) => {
        const list = mockDb.get('collaborator') || [];
        const newColl = { id: Math.random().toString(36).substring(7), ...args.data };
        list.push(newColl);
        mockDb.set('collaborator', list);
        return newColl;
      },
      findUnique: async (args: any) => {
        const list = mockDb.get('collaborator') || [];
        return list.find((c) => c.id === args.where?.id || (c.boardId === args.where?.boardId_userId?.boardId && c.userId === args.where?.boardId_userId?.userId)) || null;
      },
      findMany: async (args: any) => {
        const list = mockDb.get('collaborator') || [];
        if (args?.where?.boardId) {
          return list.filter((c) => c.boardId === args.where.boardId);
        }
        return list;
      },
      deleteMany: async () => {
        mockDb.set('collaborator', []);
        return { count: 0 };
      }
    },
    comment: {
      create: async (args: any) => {
        const list = mockDb.get('comment') || [];
        const newComment = { id: Math.random().toString(36).substring(7), resolved: false, createdAt: new Date(), ...args.data };
        list.push(newComment);
        mockDb.set('comment', list);
        return newComment;
      },
      findMany: async (args: any) => {
        const list = mockDb.get('comment') || [];
        let filtered = list;
        if (args?.where?.boardId) {
          filtered = filtered.filter((c) => c.boardId === args.where.boardId);
        }
        if (args?.where?.parentId !== undefined) {
          filtered = filtered.filter((c) => c.parentId === args.where.parentId);
        }
        const skip = args?.skip || 0;
        const take = args?.take || 50;
        return filtered.slice(skip, skip + take);
      },
      findUnique: async (args: any) => {
        const list = mockDb.get('comment') || [];
        return list.find((c) => c.id === args.where?.id) || null;
      },
      update: async (args: any) => {
        const list = mockDb.get('comment') || [];
        const idx = list.findIndex((c) => c.id === args.where?.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...args.data };
          mockDb.set('comment', list);
          return list[idx];
        }
        return null;
      },
      deleteMany: async () => {
        mockDb.set('comment', []);
        return { count: 0 };
      }
    },
    boardVersion: {
      create: async (args: any) => {
        const list = mockDb.get('version') || [];
        const newVersion = { id: Math.random().toString(36).substring(7), createdAt: new Date(), ...args.data };
        list.push(newVersion);
        mockDb.set('version', list);
        return newVersion;
      },
      findMany: async (args: any) => {
        const list = mockDb.get('version') || [];
        let filtered = list;
        if (args?.where?.boardId) {
          filtered = filtered.filter((v) => v.boardId === args.where.boardId);
        }
        return filtered;
      },
      findUnique: async (args: any) => {
        const list = mockDb.get('version') || [];
        return list.find((v) => v.id === args.where?.id) || null;
      },
      deleteMany: async () => {
        mockDb.set('version', []);
        return { count: 0 };
      }
    },
    activityLog: {
      create: async (args: any) => {
        const list = mockDb.get('activityLog') || [];
        const newLog = { id: Math.random().toString(36).substring(7), createdAt: new Date(), ...args.data };
        list.push(newLog);
        mockDb.set('activityLog', list);
        return newLog;
      },
      findMany: async (args: any) => {
        const list = mockDb.get('activityLog') || [];
        let filtered = list;
        if (args?.where?.userId) {
          filtered = filtered.filter((l) => l.userId === args.where.userId);
        }
        const skip = args?.skip || 0;
        const take = args?.take || 20;
        return filtered.slice(skip, skip + take);
      },
      deleteMany: async () => {
        mockDb.set('activityLog', []);
        return { count: 0 };
      }
    },
    session: {
      create: async (args: any) => {
        const list = mockDb.get('session') || [];
        const newSession = { id: Math.random().toString(36).substring(7), ...args.data };
        list.push(newSession);
        mockDb.set('session', list);
        return newSession;
      },
      deleteMany: async () => {
        mockDb.set('session', []);
        return { count: 0 };
      },
      findUnique: async (args: any) => {
        const list = mockDb.get('session') || [];
        return list.find((s) => s.refreshToken === args.where?.refreshToken) || null;
      },
      delete: async (args: any) => {
        const list = mockDb.get('session') || [];
        const idx = list.findIndex((s) => s.id === args.where?.id || s.refreshToken === args.where?.refreshToken);
        if (idx !== -1) {
          list.splice(idx, 1);
          mockDb.set('session', list);
        }
        return { count: 1 };
      }
    }
  };
} else {
  const globalForPrisma = global as unknown as { prisma: PrismaClient };
  prisma = globalForPrisma.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
}

export { prisma };
