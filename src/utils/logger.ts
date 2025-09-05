import winston from 'winston';
import { config } from '../config/config';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    let log = `${timestamp} ${level}: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: { service: 'throttlemeet-api' },
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: config.nodeEnv === 'development' ? consoleFormat : logFormat
    } as winston.transports.ConsoleTransportOptions),

    // File transports for production
    ...(config.nodeEnv === 'production' ? [
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      } as winston.transports.FileTransportOptions),
      new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      } as winston.transports.FileTransportOptions)
    ] : [])
  ],

  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: 'logs/exceptions.log' 
    } as winston.transports.FileTransportOptions)
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: 'logs/rejections.log' 
    } as winston.transports.FileTransportOptions)
  ]
});

// Create logs directory if it doesn't exist
if (config.nodeEnv === 'production') {
  const fs = require('fs');
  const path = require('path');
  
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Default export
export default logger;