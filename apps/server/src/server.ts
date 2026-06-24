import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { prisma } from './config/db';
import { connectRedis, redisClient } from './config/redis';
import { setupSocket } from './sockets/socketManager';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Instantiate Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e7, // 10MB payload size limit (for Yjs updates if they grow)
});

const startServer = async () => {
  try {
    // Connect Database
    await prisma.$connect();
    console.log('Database connected successfully');

    // Connect Redis Cache
    await connectRedis();

    // Setup Sockets
    await setupSocket(io);

    // Bind Port Listener
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Critical: Server start failed:', error);
    process.exit(1);
  }
};

// Graceful Shutdown Handler
const gracefulShutdown = async () => {
  console.log('Shutting down server gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed.');
    
    // Close database client
    await prisma.$disconnect();
    console.log('Database disconnected.');

    // Close Redis client connection
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('Redis disconnected.');
    }
    
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown execution.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
