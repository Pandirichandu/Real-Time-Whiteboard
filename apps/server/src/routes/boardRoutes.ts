import { Router } from 'express';
import {
  createBoard,
  getBoards,
  getBoardById,
  updateBoard,
  deleteBoard,
  duplicateBoard,
  joinBoardByInvite,
  createBoardSchema,
  updateBoardSchema,
  joinBoardSchema,
} from '../controllers/boardController';
import {
  createComment,
  getComments,
  resolveComment,
  deleteComment,
  createCommentSchema,
} from '../controllers/commentController';
import {
  createSnapshot,
  getVersions,
  restoreVersion,
  getActivityLogs,
} from '../controllers/versionController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import { authorizeBoardAccess } from '../middlewares/boardAuth';
import { BoardRole } from '@prisma/client';

const router = Router();

// Apply auth middleware to all board endpoints
router.use(authenticate);

// Put specific static routes first to prevent wildcard parameter shadowing
router.get('/activity/logs', getActivityLogs);

router.post('/', validate(createBoardSchema), createBoard);
router.get('/', getBoards);
router.get('/:id', authorizeBoardAccess(BoardRole.VIEWER), getBoardById);
router.patch('/:id', authorizeBoardAccess(BoardRole.EDITOR), validate(updateBoardSchema), updateBoard);
router.delete('/:id', authorizeBoardAccess(BoardRole.OWNER), deleteBoard);
router.post('/:id/duplicate', authorizeBoardAccess(BoardRole.VIEWER), duplicateBoard);
router.post('/join', validate(joinBoardSchema), joinBoardByInvite);

// Comments Endpoints
router.post('/:boardId/comments', authorizeBoardAccess(BoardRole.EDITOR), validate(createCommentSchema), createComment);
router.get('/:boardId/comments', authorizeBoardAccess(BoardRole.VIEWER), getComments);
router.patch('/:boardId/comments/:commentId/resolve', authorizeBoardAccess(BoardRole.EDITOR), resolveComment);
router.delete('/:boardId/comments/:commentId', authorizeBoardAccess(BoardRole.EDITOR), deleteComment);

// Versioning Endpoints
router.post('/:boardId/versions', authorizeBoardAccess(BoardRole.EDITOR), createSnapshot);
router.get('/:boardId/versions', authorizeBoardAccess(BoardRole.VIEWER), getVersions);
router.post('/:boardId/versions/:versionId/restore', authorizeBoardAccess(BoardRole.OWNER), restoreVersion);

export default router;
