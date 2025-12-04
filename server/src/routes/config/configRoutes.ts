import { Router } from "express";
import { JSONConfigManager } from "#server/components/config/DatabaseConfigManager";
import { getErrorMessage } from "#server/components/Utils";

const configRouter = Router();

configRouter.get("/config/get", (_req, res) => {
  try {
    const config = JSONConfigManager.getInstance().getConfig();
    res.json(config);
  } catch (error) {
    const message = getErrorMessage(error);
    res.status(500).json({ error: "Failed to retrieve config." });
  }
});

configRouter.post("/config/set", async (req, res) => {
  try {
    const newConfig = req.body;
    await JSONConfigManager.getInstance().updateConfig(newConfig);
    res.json({ message: "Configuration updated successfully." });
  } catch (error) {
    const message = getErrorMessage(error);
    res.status(500).json({ error: "Failed to update configuration." });
  }
});

configRouter.post("/admin/reload", async (_req, res) => {
  try {
    await JSONConfigManager.getInstance().reloadConfig();
    res.json({ message: "Configuration reloaded successfully." });
  } catch (error) {
    const message = getErrorMessage(error);
    res.status(500).json({ error: "Failed to reload configuration." });
  }
});

export default configRouter;