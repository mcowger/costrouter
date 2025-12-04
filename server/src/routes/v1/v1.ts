import { Router as ExpressRouter } from "express";
import { JSONConfigManager } from "#server/components/config/DatabaseConfigManager";
import { getErrorMessage } from "#server/components/Utils";
// import { ProviderRouter } from "#server/components/Router";
// import { UnifiedExecutor } from "#server/components/UnifiedExecutor";



const V1Router = ExpressRouter();

  // // --- 5. Core API Route ---
  // V1Router.post(
  //   "/v1/chat/completions",
  //   async (req, res, next) => {
  //     try {
  //       const costRouter = CostRouter.getInstance();
  //       await costRouter.chooseProvider(req, res);
  //     } catch (error) {
  //       res.status(500).json({ error: "Failed to choose provider" });
  //     }
  //   },
  //   async (req, res) => {
  //     try {
  //       const executor = UnifiedExecutor.getInstance();
  //       await executor.execute(req, res);
  //     } catch (error) {
  //       res.status(500).json({ error: "Failed to execute request" });
  //     }
  //   }
  // );

  V1Router.get("/v1/models", (_req, res) => {
    try {
      const allModels = new Set<string>();


      res.json({
        object: "list",
        data: [],
      });
    } catch (error) {
      const message = getErrorMessage(error);
      res.status(500).json({ error: "Failed to retrieve models." });
    }
  });

  export default V1Router;
