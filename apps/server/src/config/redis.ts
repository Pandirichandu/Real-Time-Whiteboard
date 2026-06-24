import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: redisUrl,
});

export let redisSubscriber: ReturnType<typeof createClient> | null = null;
export let redisPublisher: ReturnType<typeof createClient> | null = null;

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected successfully');
});

export const connectRedis = async () => {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log('Mock Redis connection active (skipping TCP connect)');
    return;
  }
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      
      // Setup publisher/subscriber duplicates for shared Yjs document sync
      redisSubscriber = redisClient.duplicate();
      redisPublisher = redisClient.duplicate();
      
      await Promise.all([
        redisSubscriber.connect(),
        redisPublisher.connect(),
      ]);
      
      console.log('Redis Pub/Sub subscriber and publisher instances connected successfully.');
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
    }
  }
};
