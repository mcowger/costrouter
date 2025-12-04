import { Router } from "express";
import { DatabaseConfigManager } from "#server/components/config/DatabaseConfigManager";
import { getErrorMessage } from "#server/components/Utils";



const V1Router = Router();

  // --- 5. Core API Route ---
  V1Router.post(
    "/v1/chat/completions",
    // router.chooseProvider.bind(router),
    // executor.execute.bind(executor),
  );

  V1Router.get("/v1/models", (_req, res) => {
    try {
      const providers = DatabaseConfigManager.getInstance().getProviders();
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
        owned_by: "ai", // Fixed owner as requested
      }));

      res.json({
        object: "list",
        data: modelData,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      res.status(500).json({ error: "Failed to retrieve models." });
    }
  });

  export default V1Router;