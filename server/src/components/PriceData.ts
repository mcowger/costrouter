import { Pricing } from '#schemas/src/pricing';
import { Model } from '#schemas/src/model';
import { logger } from './Logger.js';

/**
 * Singleton component for serving LLM pricing data.
 * Pricing data is sourced exclusively from the 'pricing' object within each
 * model's configuration in the main config file.
 */
export class PriceData {
  private static instance: PriceData;
  private isInitialized: boolean = false;

  // Private constructor to enforce singleton pattern
  private constructor() { }

  /**
   * Initializes the singleton PriceData instance.
   * This should be called once at application startup.
   */
  public static initialize(): void {
    if (PriceData.instance) {
      logger.warn("PriceData has already been initialized.");
      return;
    }

    PriceData.instance = new PriceData();
    PriceData.instance.isInitialized = true;
    logger.info("PriceData initialized successfully (using config-only pricing).");
  }

  /**
   * Returns the singleton instance of PriceData.
   * Throws an error if it hasn't been initialized.
   */
  public static getInstance(): PriceData {
    if (!PriceData.instance) {
      throw new Error("PriceData must be initialized before use.");
    }
    return PriceData.instance;
  }

  /**
   * Gets pricing information from the model's configuration.
   *
   * @param providerType - The provider type (for logging purposes).
   * @param model - The model object which may contain explicit pricing.
   * @returns Pricing information from the model's 'pricing' property, or undefined if not available.
   */
  public getPriceWithOverride(providerType: string, model: Model): Pricing | undefined {
    if (model.pricing) {
      logger.debug(`Using explicit pricing for '${providerType}' @ '${model.canonical_slug}'`);
      return model.pricing;
    }

    logger.debug(`No explicit pricing for '${providerType}' @ '${model.canonical_slug}' in config.`);
    return undefined;
  }

  /**
   * Returns whether the component has been successfully initialized.
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
