import type { Provider } from "#types/provider";
import type { Model } from "#types/model";
import { JSONConfigManager } from "#server/components/config/DatabaseConfigManager";
import { Request, Response, NextFunction } from "express";
import { PriceData } from "#server/components/PriceData";

export class ProviderRouter {
  private static instance: ProviderRouter;

  // Private constructor - no longer needs UsageManager
  private constructor() {}

  /**
   * Initializes the singleton Router.
   */
  public static initialize(): ProviderRouter {
    if (ProviderRouter.instance) {
      return ProviderRouter.instance;
    } else {
      ProviderRouter.instance = new ProviderRouter();
      return ProviderRouter.instance;
    }
  }

  /**
   * Returns the singleton instance of the Router.
   * Throws an error if it hasn't been initialized.
   */
  public static getInstance(): ProviderRouter {
    if (!ProviderRouter.instance) {
      throw new Error("Router must be initialized before use.");
    }
    return ProviderRouter.instance;
  }

  private getAllProvidersForModel(modelname: string): Provider[] {
    let foundProviders: Provider[] = []
    const model = ProviderRouter.getModelFromName(modelname)
    for (const provider of model.providers) {
      const providerId = provider.providerId
      const providerEntry = ProviderRouter.getProviderFromId(providerId)
      foundProviders.push(providerEntry)
    }
    return foundProviders;
  }

  public chooseProvider(req: Request, res: Response): Provider {
    const modelName = req.body.model as string;
    const result = this.getAllProvidersForModel(modelName);
    return result[0]; //for now, just choose first result
  }

  public static getModelFromName(modelname: string): Model {
    const config = JSONConfigManager.getInstance().getConfig();
    const models = config.models;

    const foundModel: Model | undefined = models.find(
      (model) => model.exposed_slug === modelname,
    );
    // 1. Check for undefined explicitly
    if (!foundModel) {
      throw new Error("No Such Model Found");
    }
    return foundModel
  }
  public static getProviderFromId(providerId: string): Provider {
    const config = JSONConfigManager.getInstance().getConfig();
    const providers = config.providers;
    const foundProvider = providers.find(p => providerId.includes(p.id));
    if (!foundProvider) {
      throw new Error("No Such Provider")
    }
    return foundProvider
  }

}
