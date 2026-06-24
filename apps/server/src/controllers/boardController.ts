import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { cryptoRandomString } from '../utils/random'; // We'll add this util or use crypto directly

// Zod schemas for input validation
export const createBoardSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(100),
    description: z.string().max(500).optional(),
    visibility: z.enum(['PRIVATE', 'TEAM', 'PUBLIC']).default('PRIVATE'),
    teamId: z.string().uuid().optional(),
    isTemplate: z.boolean().default(false),
  }),
});

export const updateBoardSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    visibility: z.enum(['PRIVATE', 'TEAM', 'PUBLIC']).optional(),
    isArchived: z.boolean().optional(),
  }),
});

export const joinBoardSchema = z.object({
  body: z.object({
    inviteCode: z.string().min(1, 'Invite code is required'),
  }),
});

export const createBoard = async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, visibility, teamId, isTemplate } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.plan === 'FREE') {
      const currentBoards = await prisma.board.count({ where: { ownerId: userId } });
      if (currentBoards >= 3) {
        return res.status(403).json({
          status: 'error',
          message: 'Workspace Limit Reached: Free plans are limited to 3 boards. Please upgrade to Premium for unlimited workspaces!',
        });
      }
    }

    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const board = await prisma.board.create({
      data: {
        title,
        description,
        visibility,
        ownerId: userId,
        teamId: teamId || null,
        isTemplate,
        inviteCode,
        collaborators: {
          create: {
            userId: userId,
            role: 'OWNER',
          },
        },
      },
    });

    return res.status(201).json({ status: 'success', data: board });
  } catch (error) {
    console.error('Create board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to create board' });
  }
};

export const getBoards = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;

    const boards = await prisma.board.findMany({
      where: {
        isArchived: false,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        collaborators: { include: { user: { select: { name: true, avatarUrl: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip,
    });

    return res.json({ status: 'success', data: boards });
  } catch (error) {
    console.error('Get boards error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve boards' });
  }
};

export const getBoardById = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        collaborators: true,
      },
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    // Check permissions
    const isPublic = board.visibility === 'PUBLIC';
    const isCollaborator = board.collaborators.some((collab: any) => collab.userId === userId);
    
    if (!isPublic && !isCollaborator && board.ownerId !== userId) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    return res.json({ status: 'success', data: board });
  } catch (error) {
    console.error('Get board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve board details' });
  }
};

export const updateBoard = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const board = await prisma.board.findUnique({
      where: { id },
      include: { collaborators: true },
    });

    if (!board) return res.status(404).json({ status: 'error', message: 'Board not found' });

    // Check if user is OWNER or EDITOR
    const userCollab = board.collaborators.find((c: any) => c.userId === userId);
    const hasWritePermission = board.ownerId === userId || (userCollab && (userCollab.role === 'OWNER' || userCollab.role === 'EDITOR'));

    if (!hasWritePermission) {
      return res.status(403).json({ status: 'error', message: 'You do not have write permissions for this board' });
    }

    const updatedBoard = await prisma.board.update({
      where: { id },
      data: req.body,
    });

    return res.json({ status: 'success', data: updatedBoard });
  } catch (error) {
    console.error('Update board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update board' });
  }
};

export const deleteBoard = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) return res.status(404).json({ status: 'error', message: 'Board not found' });

    // Only OWNER can delete
    if (board.ownerId !== userId) {
      return res.status(403).json({ status: 'error', message: 'Only the board owner can delete this board' });
    }

    await prisma.board.delete({ where: { id } });
    return res.json({ status: 'success', message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Delete board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to delete board' });
  }
};

export const duplicateBoard = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const sourceBoard = await prisma.board.findUnique({
      where: { id },
      include: { elements: true },
    });

    if (!sourceBoard) return res.status(404).json({ status: 'error', message: 'Source board not found' });

    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const duplicatedBoard = await prisma.board.create({
      data: {
        title: `${sourceBoard.title} (Copy)`,
        description: sourceBoard.description,
        visibility: 'PRIVATE',
        ownerId: userId,
        inviteCode,
        collaborators: {
          create: {
            userId: userId,
            role: 'OWNER',
          },
        },
        elements: {
          createMany: {
            data: sourceBoard.elements.map((el: any) => ({
              type: el.type,
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
              scaleX: el.scaleX,
              scaleY: el.scaleY,
              fill: el.fill,
              stroke: el.stroke,
              strokeWidth: el.strokeWidth,
              angle: el.angle,
              text: el.text,
              fontFamily: el.fontFamily,
              fontSize: el.fontSize,
              opacity: el.opacity,
              layerOrder: el.layerOrder,
              extraData: el.extraData || undefined,
            })),
          },
        },
      },
    });

    return res.status(201).json({ status: 'success', data: duplicatedBoard });
  } catch (error) {
    console.error('Duplicate board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to duplicate board' });
  }
};

export const joinBoardByInvite = async (req: AuthenticatedRequest, res: Response) => {
  const { inviteCode } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const board = await prisma.board.findUnique({
      where: { inviteCode },
      include: { collaborators: true },
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Invalid invite code or board not found' });
    }

    const alreadyCollaborator = board.collaborators.some((c: any) => c.userId === userId);
    if (alreadyCollaborator) {
      return res.json({ status: 'success', message: 'Already a collaborator', data: board });
    }

    const updatedCollab = await prisma.boardCollaborator.create({
      data: {
        boardId: board.id,
        userId: userId,
        role: 'EDITOR', // Default invite role
      },
    });

    return res.json({ status: 'success', message: 'Joined board successfully', data: board });
  } catch (error) {
    console.error('Join board error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to join board' });
  }
};
