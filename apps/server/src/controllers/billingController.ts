import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

// Lazily load Stripe to avoid crash if API key is not present
const stripeSecret = process.env.STRIPE_SECRET_KEY;
let stripe: any = null;
if (stripeSecret) {
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(stripeSecret);
  } catch (err) {
    console.error('Failed to initialize Stripe client:', err);
  }
}

/**
 * Creates Stripe Checkout Session for Premium subscription
 */
export const createCheckoutSession = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const userId = req.user.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (user.plan === 'PREMIUM') {
      return res.status(400).json({ status: 'error', message: 'You are already subscribed to Premium plan.' });
    }

    const successUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard`;

    if (stripe) {
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Whiteboard Hub SaaS Premium Plan',
                description: 'Unlimited boards, team integrations, WebRTC voice collaboration and AI Copilot access.',
              },
              unit_amount: 1500, // $15.00
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: user.id,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return res.json({
        status: 'success',
        data: {
          url: session.url,
          sessionId: session.id,
        },
      });
    } else {
      // If Stripe is not configured in production, block access
      if (process.env.NODE_ENV === 'production') {
        return res.status(501).json({
          status: 'error',
          message: 'Subscription services are currently misconfigured. Please contact support.',
        });
      }

      // Mock developer mode fallback - NO direct upgrade in checkout, must go through webhook simulation
      console.log('Stripe Key missing. Issuing developer mock checkout URL.');
      
      return res.json({
        status: 'success',
        data: {
          url: `${successUrl}&mock=success`,
          sessionId: 'mock_session_id',
        },
      });
    }
  } catch (error) {
    console.error('Checkout creation failed:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create subscription checkout session' });
  }
};

/**
 * Handle Stripe webhook events to fulfill subscription upgrades/downgrades
 */
export const stripeWebhook = async (req: any, res: Response) => {
  const sig = req.headers['stripe-signature'];
  let event: any;

  try {
    const isProduction = process.env.NODE_ENV === 'production';

    if (stripe && sig) {
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, endpointSecret);
    } else {
      // In production, signature checking is mandatory. Reject unsigned payloads.
      if (isProduction) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing Stripe signature headers in production.',
        });
      }
      
      // Direct raw parsing allowed for testing or local development when signatures are not configured
      event = req.body;
    }

    if (!event || !event.type) {
      return res.status(400).send('Webhook parsing issue');
    }

    // Process relevant webhook events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan: 'PREMIUM',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
            },
          });
          console.log(`User ${userId} successfully upgraded to PREMIUM via Stripe checkout`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'FREE',
              stripeSubscriptionId: null,
            },
          });
          console.log(`User ${user.id} subscription expired. Plan reverted to FREE.`);
        }
        break;
      }
      default:
        console.log(`Unhandled Stripe Webhook type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

/**
 * Fetches billing details and current plan limits status
 */
export const getBillingStatus = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const userId = req.user.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Count user boards
    const boardsCount = await prisma.board.count({
      where: { ownerId: userId },
    });

    const isLimitExceeded = user.plan === 'FREE' && boardsCount >= 3;

    return res.json({
      status: 'success',
      data: {
        plan: user.plan,
        boardsCreated: boardsCount,
        maxFreeBoards: 3,
        isLimitExceeded,
      },
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve billing status' });
  }
};
