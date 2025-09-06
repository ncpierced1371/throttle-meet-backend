import winston from 'winston';
import { config } from '../config/config';

// Custom log format

// Console format for development

// Create logger instance

// Default export
// Use Fastify's built-in logger. No separate logger needed.
import { FastifyLoggerInstance } from 'fastify';
const logger: FastifyLoggerInstance = FastifyLoggerInstance.create();
export default logger;