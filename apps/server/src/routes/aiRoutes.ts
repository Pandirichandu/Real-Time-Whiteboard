import { Router } from 'express';
import { generateDiagram, generateSummary, autoLayout, copilot, diagramSchema } from '../controllers/aiController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import { authorizeBoardAccess } from '../middlewares/boardAuth';
import { BoardRole } from '@prisma/client';

const router = Router();

// Apply auth middleware to all AI routes
router.use(authenticate);

router.post('/diagram', authorizeBoardAccess(BoardRole.EDITOR), validate(diagramSchema), generateDiagram);
router.get('/summary/:boardId', authorizeBoardAccess(BoardRole.VIEWER), generateSummary);
router.post('/layout', authorizeBoardAccess(BoardRole.EDITOR), autoLayout);
router.post('/copilot', authorizeBoardAccess(BoardRole.VIEWER), copilot);

export default router;
