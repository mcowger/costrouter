import type { Pricing } from '#types/pricing';
import type { Model } from '#types/model';

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
      return;
    }

    PriceData.instance = new PriceData();
    PriceData.instance.isInitialized = true;
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
      return model.pricing;
    }

    return undefined;
  }

  /**
   * Returns whether the component has been successfully initialized.
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
