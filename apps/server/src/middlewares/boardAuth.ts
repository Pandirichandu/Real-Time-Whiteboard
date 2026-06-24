import { Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from './auth';
import { BoardRole } from '@prisma/client';

/**
 * Middleware to authorize board access based on user role and board visibility.
 * Checks permissions matching or exceeding the required role.
 * Role hierarchy: OWNER > EDITOR > VIEWER
 */
export const authorizeBoardAccess = (requiredRole: BoardRole = BoardRole.VIEWER) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const userId = req.user.userId;
    // Extract boardId from req.params, req.body, or req.query
    const boardId = req.params.boardId || req.params.id || req.body.boardId || (req.query.boardId as string);

    if (!boardId) {
      return res.status(400).json({ status: 'error', message: 'Board ID is required for access validation' });
    }

    try {
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
          collaborators: {
            where: { userId },
          },
        },
      });

      if (!board) {
        return res.status(404).json({ status: 'error', message: 'Board not found' });
      }

      const isOwner = board.ownerId === userId;
      const collaborator = board.collaborators[0];
      const userRole = isOwner ? BoardRole.OWNER : collaborator?.role;

      // Public board view access
      if (board.visibility === 'PUBLIC' && requiredRole === BoardRole.VIEWER) {
        return next();
      }

      if (!userRole) {
        return res.status(403).json({ status: 'error', message: 'Access denied: You are not a collaborator on this board.' });
      }

      // Check role hierarchy requirements
      if (requiredRole === BoardRole.OWNER && userRole !== BoardRole.OWNER) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Owner permissions required.' });
      }

      if (requiredRole === BoardRole.EDITOR && userRole === BoardRole.VIEWER) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Editor/Owner permissions required.' });
      }

      // If user has the required permission level
      return next();
    } catch (error) {
      console.error('Board authorization error:', error);
      return res.status(500).json({ status: 'error', message: 'Internal server authorization check failed' });
    }
  };
};
