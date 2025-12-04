import type { Pricing } from '#types/pricing';

/**
 * Type definition for a single model configuration, including optional pricing.
 */
export type Model = {
  /** The name of the model as used by the provider.  This is what will be sent in the LLM completion call*/
  canonical_slug: string;
  /**
   * Optional mapped name for the model that clients will use in requests.
   * If not provided, the 'name' field will be used for both provider calls and client requests.
   * Example: name="google/gemini-2.5-flash", mappedName="gemini-2.5-flash"
   */
  exposed_slug?: string;

    /**
   The pretty name we show: "Gemini 2.5 Flash"
   */
  display_name?: string;

  // The name we will use to looking pricing data.
  pricing_name?: string;

  /** Override pricing info for this specific model. */
  pricing?: Pricing;
};