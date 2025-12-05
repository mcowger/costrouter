import pino from 'pino';
import { pinoHttp } from 'pino-http';

// Define the log level based on the environment
const logLevel = process.env.LOG_LEVEL || 'info';

// Check if we are in a development environment
const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: logLevel,
  // Only use pino-pretty in development for readable logs
  // In production, keep standard JSON for better performance and parsing
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard', // Human-readable time
          ignore: 'pid,hostname', // Clean up the output
        },
      }
    : undefined,
});

// Export the singleton instance directly

// Separate middleware to log the incoming request
export const logIncoming = (req: any, res: any, next: any) => {
  logger.info(req, 'Incoming request');
  next();
};

export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err) return 'error';
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
