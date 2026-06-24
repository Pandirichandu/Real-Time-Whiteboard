import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  registerSchema,
  loginSchema,
  refreshSchema,
} from '../controllers/authController';
import { validate } from '../middlewares/validation';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', logout);

export default router;
