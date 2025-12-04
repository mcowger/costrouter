import pino from 'pino';

// Define the log level based on the environment
const logLevel = process.env.LOG_LEVEL || 'info';

// Check if we are in a development environment
const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
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
export default logger;