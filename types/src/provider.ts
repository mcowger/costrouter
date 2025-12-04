

/**
 * Supported AI SDK v5 provider types
 */
export type ProviderType = 
  // Native AI SDK providers
  | "openai"
  // Third-party providers
  | "openrouter"
  | "ollama"
  // OpenAI-compatible and custom providers
  | "openai-compatible";

/**
 * Type definition for a single LLM provider configuration.
 * Supports all AI SDK v4 providers with provider-specific validation.
 */
export type Provider = {
  /** A unique system identifier, 32 characters max. */
  id: string;

  /** The type of provider */
  type: ProviderType;

  // Common authentication fields
  apiKey: string;

  // OpenAI-compatible specific fields
  /** Base URL (required for openai-compatible, custom, and legacy openai types) */
  baseURL?: string;

  // Supported models.  We look up based on 
  // Record<exposed_slug,canonical_slug>
  models: Record<string,string>[]
};

