import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.object({
    text: z.string().min(1),
    x: z.number(),
    y: z.number(),
    parentId: z.string().uuid().optional(),
  }),
});

export const createComment = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId } = req.params;
  const { text, x, y, parentId } = req.body;

  try {
    // Verify board exists and user is collaborator/owner
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { ownerId: req.user.userId },
          { visibility: 'PUBLIC' },
          { collaborators: { some: { userId: req.user.userId } } },
        ],
      },
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found or access denied' });
    }

    const comment = await prisma.comment.create({
      data: {
        boardId,
        userId: req.user.userId,
        text,
        x,
        y,
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      status: 'success',
      data: comment,
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const getComments = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId } = req.params;

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;

    const comments = await prisma.comment.findMany({
      where: {
        boardId,
        parentId: null, // Get root comments only
      },
      take: limit,
      skip,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      status: 'success',
      data: comments,
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const resolveComment = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { commentId } = req.params;

  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        resolved: !comment.resolved,
      },
    });

    res.json({
      status: 'success',
      data: updatedComment,
    });
  } catch (error) {
    console.error('Resolve comment error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const deleteComment = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { commentId } = req.params;

  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    // Only creator of comment or board owner can delete
    const board = await prisma.board.findUnique({
      where: { id: comment.boardId },
    });

    if (comment.userId !== req.user.userId && board?.ownerId !== req.user.userId) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    res.json({
      status: 'success',
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
