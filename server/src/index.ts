import express from "express";
import cors from "cors";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import { DatabaseConfigManager } from "#server/components/config/DatabaseConfigManager";
import { PriceData } from "#server/components/PriceData";
import { Router } from "#server/components/Router";
import { UnifiedExecutor } from "#server/components/UnifiedExecutor";
import configRouter from "#server/routes/config/configRoutes";
import V1Router from "#server/routes/v1/v1";
import logger  from '#types/logger'

async function main() {
  // --- 1. Argument Parsing ---
  const argv = await yargs(hideBin(process.argv))
    .option("config-database", {
      alias: "cd",
      type: "string",
      description: "Path to the configuration LowDB JSON database file",
      required: true,
    })
    .parse();

  // --- 2. Initialize Singletons in Order ---
  await DatabaseConfigManager.initialize(
    argv.configDatabase,
  );

  PriceData.initialize();
  Router.initialize();

  // --- 3. Get Instances ---
  const router = Router.getInstance();
  const executor = UnifiedExecutor.getInstance();

  // --- 3. Express Server Setup ---
  // Initialize Express application
  const app = express();
  // Enable JSON body parsing for incoming requests with increased size limit
  app.use(express.json({ limit: "5mb" }));
  app.use(cors());

  // --- 4. Health Check Endpoint ---
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });


  // Add the routes for completions
  app.use("/", V1Router);

  // Add the routes for configs
  app.use("/", configRouter);

  // --- Static UI Serving (after API routes) ---

  // Use process.cwd() to reliably get the project root directory.
  const projectRoot = process.cwd();

  // // The path to the compiled UI is now consistently in `dist/ui`.
  // const uiPath = path.join(projectRoot, "dist", "ui");

  // // Serve all static files from the correct build directory.
  // app.use(express.static(uiPath));

  // // For any non-API request, send the main index.html file to support the SPA.
  // app.get("*", (_req, res) => {
  //   // Use a try-catch block for graceful error handling if the file is missing.
  //   try {
  //     res.sendFile(path.join(uiPath, "index.html"));
  //   } catch (err) {
  //     res.status(404).send("UI not found. Please run the build process.");
  //   }
  // });

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {});

  // --- Graceful Shutdown ---
  const gracefulShutdown = async (_signal: string) => {
    server.close(async () => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

// Run the main function and catch any top-level errors.
main().catch((error) => {
  console.error("Failed to start the application:", error);
  process.exit(1);
});
