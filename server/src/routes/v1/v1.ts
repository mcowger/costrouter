import { Router as ExpressRouter } from 'express';
import { JSONConfigManager } from '#server/components/config/DatabaseConfigManager';
import { getErrorMessage } from '#server/components/Utils';
import logger from '#types/logger.js';
import { ProviderRouter } from '#server/components/Router';
import { UnifiedExecutor } from '#server/components/UnifiedExecutor';
import type { Provider } from '#types/provider';
import type { Model } from '#types/model';

const V1Router = ExpressRouter();

// --- 5. Core API Route ---
V1Router.post('/v1/chat/completions', async (req, res, _next) => {
  try {
    res.locals.chosenProvider = ProviderRouter.getInstance().chooseProvider(req, res);
    res.locals.chosenModel = ProviderRouter.getModelFromName(req.body.model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to choose provider' });
  }
    const executor = UnifiedExecutor.getInstance();
    executor.execute(req, res);
});

V1Router.get('/v1/models', (_req, res) => {
  try {
    type V1ModelsEntry = {
      id: string;
      name?: string;
      providers: { providerId: string; provider_model_slug: string }[];
    };
    let models_data: V1ModelsEntry[] = [];
    const config = JSONConfigManager.getInstance().getConfig();
    for (const model of config.models) {
      const temp: V1ModelsEntry = {
        id: model.exposed_slug,
        name: model.display_name || model.exposed_slug,
        providers: model.providers,
      };
      models_data.push(temp);
    }

    res.json({
      data: models_data,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(message);
    res.status(500).json({ error: `Failed to retrieve models: ${message}` });
  }
});

export default V1Router;
