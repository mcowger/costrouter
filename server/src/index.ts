import express from "express";
import cors from "cors";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import path from 'path';
import { ConfigManager } from "./components/config/ConfigManager.js";
import { PriceData } from "./components/PriceData.js";
import { Router } from "./components/Router.js";
import { logger, responseBodyLogger, requestResponseLogger, PinoLogger } from "./components/Logger.js";
import { UnifiedExecutor } from "./components/UnifiedExecutor.js";
import { getErrorMessage } from "./components/Utils.js";


async function main() {
  // --- 1. Argument Parsing ---
  const argv = await yargs(hideBin(process.argv))
    .option("config-database", {
      alias: "cd",
      type: "string",
      description: "Path to the configuration LowDB JSON database file",
      required: true,
    })
    .option("loglevel", {
      alias: "l",
      type: "string",
      description: "Logging level (info, debug, warn, error)",
      default: "info",
    })
    .parse();

  // Set initial log level from CLI argument
  logger.level = argv.loglevel;

  // --- 2. Initialize Singletons in Order ---
  await ConfigManager.initialize({ databasePath: argv.configDatabase as string });

  // Apply log level from config if available, otherwise use CLI argument
  try {
    const config = ConfigManager.getInstance().getConfig();
    const configLogLevel = config.logLevel;
    const finalLogLevel = configLogLevel || argv.loglevel;
    PinoLogger.setLogLevel(finalLogLevel);
    logger.info(`Log level set to: ${finalLogLevel}${configLogLevel ? ' (from config)' : ' (from CLI)'}`);
  } catch (error) {
    logger.warn(`Failed to apply config log level, using CLI argument: ${argv.loglevel}`);
    PinoLogger.setLogLevel(argv.loglevel);
  }
  PriceData.initialize();
  Router.initialize();


  // --- 3. Get Instances ---
  const router = Router.getInstance();
  const executor = UnifiedExecutor.getInstance();

  // --- 3. Express Server Setup ---
  // Initialize Express application
  const app = express();
  // Enable JSON body parsing for incoming requests with increased size limit
  app.use(express.json({ limit: '5mb' }));
  app.use(cors());

  // Apply response body logging middleware
  app.use(responseBodyLogger);
  // Apply request and response logging middleware
  app.use(requestResponseLogger);

  // --- 4. Health Check Endpoint ---
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  });

  // --- 5. Core API Route ---
  app.post(
    "/v1/chat/completions",
    router.chooseProvider.bind(router),
    executor.execute.bind(executor),
  );

  app.get("/v1/models", (_req, res) => {
    try {
      const providers = ConfigManager.getInstance().getProviders();
      const allModels = new Set<string>();

      for (const provider of providers) {
        for (const model of provider.models) {
          allModels.add(model.exposed_slug ?? model.canonical_slug);
        }
      }

      const modelData = Array.from(allModels).map((modelId) => ({
        id: modelId,
        object: "model",
        created: 1686935002, // Fixed timestamp as requested
        owned_by: "ai",      // Fixed owner as requested
      }));

      res.json({
        object: "list",
        data: modelData,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get models: ${message}`);
      res.status(500).json({ error: "Failed to retrieve models." });
    }
  });

  // --- 6. Config API Routes ---
  app.get("/config/get", (_req, res) => {
    try {
      const config = ConfigManager.getInstance().getConfig();
      res.json(config);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get config: ${message}`);
      res.status(500).json({ error: "Failed to retrieve config." });
    }
  });

  app.post("/config/set", async (req, res) => {
    try {
      const newConfig = req.body;
      await ConfigManager.getInstance().updateConfig(newConfig);
      res.json({ message: "Configuration updated successfully." });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to set config: ${message}`);
      res.status(500).json({ error: "Failed to update configuration." });
    }
  });

  app.post("/admin/reload", async (_req, res) => {
    try {
      logger.info("Configuration reload requested via API endpoint");

      // Reload the configuration from disk
      await ConfigManager.getInstance().reloadConfig();
      logger.info("Configuration reloaded from disk");

      // Rate limiting has been disabled, so no limiter updates are needed

      res.json({ message: "Configuration reloaded successfully." });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to reload configuration: ${message}`);
      res.status(500).json({ error: "Failed to reload configuration." });
    }
  });

  // --- 7. Logging Admin API Routes ---
  app.get("/admin/logging/level", (_req, res) => {
    try {
      const currentLevel = PinoLogger.getCurrentLogLevel();
      res.json({ level: currentLevel });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get current log level: ${message}`);
      res.status(500).json({ error: "Failed to retrieve current log level." });
    }
  });

  app.post("/admin/logging/level", (req, res) => {
    try {
      const { level } = req.body;
      if (!level || typeof level !== 'string') {
        return res.status(400).json({ error: "Log level is required and must be a string." });
      }

      PinoLogger.setLogLevel(level);
      logger.info(`Log level changed to: ${level}`);

      res.json({
        message: `Log level successfully changed to ${level}`,
        level: level
      });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to set log level: ${message}`);
      res.status(400).json({ error: message });
    }
  });




  // --- 9.5. Logging Admin API Routes ---
  app.get("/admin/logging/level", (_req, res) => {
    try {
      const currentLevel = PinoLogger.getCurrentLogLevel();
      res.json({ level: currentLevel });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get log level: ${message}`);
      res.status(500).json({ error: "Failed to retrieve log level." });
    }
  });

  app.post("/admin/logging/level", (req, res) => {
    try {
      const { level } = req.body;
      if (!level || typeof level !== 'string') {
        return res.status(400).json({ error: "Log level is required and must be a string." });
      }

      PinoLogger.setLogLevel(level);
      logger.info(`Log level changed to: ${level}`);
      res.json({ message: `Log level successfully changed to ${level}`, level });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to set log level: ${message}`);
      res.status(400).json({ error: message });
    }
  });


  // --- Static UI Serving (after API routes) ---

  // Use process.cwd() to reliably get the project root directory.
  const projectRoot = process.cwd();

  // The path to the compiled UI is now consistently in `dist/ui`.
  const uiPath = path.join(projectRoot, 'dist', 'ui');

  // Serve all static files from the correct build directory.
  app.use(express.static(uiPath));

  // For any non-API request, send the main index.html file to support the SPA.
  app.get('*', (_req, res) => {
    // Use a try-catch block for graceful error handling if the file is missing.
    try {
      res.sendFile(path.join(uiPath, 'index.html'));
    } catch (err) {
      res.status(404).send('UI not found. Please run the build process.');
    }
  });


  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    logger.info(`LLM Gateway listening on port ${PORT}`);
  });

  // --- Graceful Shutdown ---
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Run the main function and catch any top-level errors.
main().catch((error) => {
  console.error("Failed to start the application:", error);
  process.exit(1);
});
