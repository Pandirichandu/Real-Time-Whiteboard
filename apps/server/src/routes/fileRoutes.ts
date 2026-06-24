import { Router } from 'express';
import { getPresignedUrl, handleLocalDevUpload, presignedSchema } from '../controllers/fileController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import { authorizeBoardAccess } from '../middlewares/boardAuth';
import { BoardRole } from '@prisma/client';

const router = Router();

// Apply authentication middleware
router.use(authenticate);

router.post('/presigned', authorizeBoardAccess(BoardRole.EDITOR), validate(presignedSchema), getPresignedUrl);

// Handles raw binary uploads in local dev fallback mode
router.put('/upload-local', handleLocalDevUpload);

export default router;
