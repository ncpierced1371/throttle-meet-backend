import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { validateRequest } from './middleware/validation';

// Import routes
import { authRoutes } from './routes/auth';
import userRoutes from './routes/users';
import { eventRoutes } from './routes/events';
import { routeRoutes } from './routes/routes';
import socialRoutes from './routes/social';
import uploadRoutes from './routes/upload';

// Extend Request type
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

class ThrottleMeetServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST']
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.corsOrigin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing and compression
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (config.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => logger.info(message.trim())
        }
      }));
    }

    // Request ID for tracking
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substring(2, 15);
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV
      });
    });

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/users', authMiddleware, userRoutes);
    this.app.use('/api/v1/events', authMiddleware, eventRoutes);
    this.app.use('/api/v1/routes', authMiddleware, routeRoutes);
    this.app.use('/api/v1/social', authMiddleware, socialRoutes);
    this.app.use('/api/v1/upload', authMiddleware, uploadRoutes);

    // 404 handler for unknown routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
      });
    });
  }

  private setupSocketIO(): void {
    this.io.use((socket, next) => {
      // Socket authentication middleware
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      // TODO: Verify JWT token
      next();
    });

    this.io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // Join user-specific room
      const userId = socket.handshake.auth.userId;
      if (userId) {
        socket.join(`user:${userId}`);
      }

      // Handle real-time events
      socket.on('join_event', (eventId: string) => {
        socket.join(`event:${eventId}`);
        logger.info(`User joined event room: ${eventId}`);
      });

      socket.on('leave_event', (eventId: string) => {
        socket.leave(`event:${eventId}`);
        logger.info(`User left event room: ${eventId}`);
      });

      socket.on('location_update', (data: any) => {
        // Broadcast location to event participants
        if (data.eventId) {
          socket.to(`event:${data.eventId}`).emit('participant_location', {
            userId: userId,
            location: data.location,
            timestamp: new Date()
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled rejection:', err);
      process.exit(1);
    });

    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught exception:', err);
      process.exit(1);
    });
  }

  public start(): void {
    const port = config.port;
    const host = config.host;

    this.server.listen(port, host, () => {
  logger.info(`🚀 ThrottleMeet API server running on http://${host}:${port}`);
  logger.info(`📝 Environment: ${config.NODE_ENV}`);
  logger.info(`🔗 Socket.IO enabled`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}

// Start server if this file is run directly

// Start server unless in test environment
if (process.env.NODE_ENV !== 'test') {
  const server = new ThrottleMeetServer();
  server.start();
}

export default ThrottleMeetServer;