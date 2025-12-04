import { pino, type Logger } from "pino";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import lodash from "lodash";

/**
 * A custom middleware to capture the response body. This needs to be placed
 * before any route handlers.
 */
export const responseBodyLogger = (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  const originalSend = res.send;
  res.send = function (chunk) {
    (res as any).responseBody = chunk;
    return originalSend.apply(res, arguments as any);
  };
  next();
};

/**
 * A custom logging middleware that logs requests and responses separately.
 */
export const requestResponseLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = randomUUID();
  const logger = PinoLogger.getLogger();

  // Log incoming request based on log level
  const { method, url, headers, body } = req;
  const requestLogObject: any = { requestId, type: "request", method, url };

  if (logger.isLevelEnabled("trace")) {
    requestLogObject.headers = headers;
    requestLogObject.body = body;
    logger.trace(requestLogObject, `--> ${method} ${url}`);
  } else if (logger.isLevelEnabled("debug")) {
    requestLogObject.messagePreview = lodash.get(body, "messages[0]");
    logger.debug(requestLogObject, `--> ${method} ${url}`);
  } else if (logger.isLevelEnabled("info")) {
    // Log /usage/current requests at debug level to reduce noise
    if (url === '/usage/current') {
      logger.debug(null, `--> ${method} ${url}`);
    } else {
      logger.info(null, `--> ${method} ${url}`);
    }
  }

  const startTime = Date.now();

  // Log outgoing response on finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const { statusCode, statusMessage } = res;
    const responseLogObject: any = {
      requestId,
      type: "response",
      statusCode,
      statusMessage,
      durationMs: duration,
    };

    let responseBody;
    if ((res as any).responseBody) {
      try {
        responseBody = JSON.parse((res as any).responseBody.toString());
      } catch (e) {
        responseBody = (res as any).responseBody.toString();
      }
    }

    if (logger.isLevelEnabled("trace")) {
      responseLogObject.headers = res.getHeaders();
      responseLogObject.body = responseBody;
      logger.trace(
        responseLogObject,
        `<-- ${method} ${url} ${statusCode} ${duration}ms`,
      );
    } else if (logger.isLevelEnabled("debug")) {
      // Extract content preview from either OpenAI format or AI SDK format
      let contentPreview = "";
      if (responseBody) {
        // Try OpenAI format first: choices[0].message.content
        const openAIContent = lodash.get(responseBody, "choices[0].message.content");
        if (openAIContent) {
          contentPreview = openAIContent.slice(0, 40);
        } else {
          // Fallback to AI SDK format: text
          const aiSdkContent = lodash.get(responseBody, "text");
          if (aiSdkContent) {
            contentPreview = aiSdkContent.slice(0, 40);
          }
        }
      }
      responseLogObject.choicePreview = contentPreview;
      logger.debug(
        responseLogObject,
        `<-- ${method} ${url} ${statusCode} ${duration}ms`,
      );
    } else if (logger.isLevelEnabled("info")) {
      // Log /usage/current responses at debug level to reduce noise
      if (url === '/usage/current') {
        logger.debug(
          null,
          `<-- ${method} ${url} ${statusCode} ${duration}ms`,
        );
      } else {
        logger.info(
          null,
          `<-- ${method} ${url} ${statusCode} ${duration}ms`,
        );
      }
    }
  });

  next();
};

export class PinoLogger {
  private static instance: Logger;
  private static options: pino.LoggerOptions = {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false,
        ignore: "pid,hostname",
      },
    },
  };

  private constructor() {}

  public static getLogger(): Logger {
    if (!PinoLogger.instance) {
      PinoLogger.instance = pino(PinoLogger.options);
    }
    return PinoLogger.instance;
  }

  public static configure(options: pino.LoggerOptions): void {
    if (PinoLogger.instance) {
      throw new Error("Logger already initialized");
    }
    PinoLogger.options = options;
  }

  /**
   * Dynamically change the log level of the current logger instance
   */
  public static setLogLevel(level: string): void {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
    }

    if (PinoLogger.instance) {
      PinoLogger.instance.level = level;
    }
    // Also update the stored options for future instances
    PinoLogger.options.level = level;
  }

  /**
   * Get the current log level
   */
  public static getCurrentLogLevel(): string {
    if (PinoLogger.instance) {
      return PinoLogger.instance.level;
    }
    return PinoLogger.options.level || 'info';
  }

  /**
   * Check if the logger is initialized
   */
  public static isInitialized(): boolean {
    return !!PinoLogger.instance;
  }
}

export const logger = PinoLogger.getLogger();