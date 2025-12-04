import type { Pricing } from '#types/pricing';

/**
 * Type definition for a single model configuration, including optional pricing.
 */
export type Model = {
  /**

   */
  exposed_slug: string;

    /**
   The pretty name we show: "Gemini 2.5 Flash"
   */
  display_name?: string;

  // The name we will use to looking pricing data.
  pricing_name?: string;

  /** Override pricing info for this specific model. */
  pricing?: Pricing;

  /** provider IDs where this model can be used */
  providers: {
    providerId: string;
    provider_model_slug: string;
  }[];
};
