import { Router } from 'express';
import { createCheckoutSession, stripeWebhook, getBillingStatus } from '../controllers/billingController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Public webhook route (Stripe calls this directly, so no auth middleware here)
router.post('/webhook', stripeWebhook);

// Protected routes
router.post('/checkout', authenticate, createCheckoutSession);
router.get('/status', authenticate, getBillingStatus);

export default router;
