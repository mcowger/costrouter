
import type { Model } from '#types/model';





/**
 * Type definition for a single LLM provider configuration.
 * Supports all AI SDK v4 providers with provider-specific validation.
 */
export type Provider = {
  /** A unique system identifier, 32 characters max. */
  id: string;

  /** The type of provider */
  type: string;

  // Common authentication fields
  apiKey: string;

  // OpenAI-compatible specific fields
  /** Base URL (required for openai-compatible, custom, and legacy openai types) */
  baseURL?: string;

  // Supported models as proper Model objects
  models: Model[]
};

