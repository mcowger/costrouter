import type { Provider } from '#types/provider';
import type { Model } from '#types/model';

/**
 * Type definition for the main application configuration file (`config.json`).
 * Defines the overall structure of the config.
 */
export type AppConfig = {
  /** A list of all configured LLM providers. */
  providers: Provider[];

  /** All the models specified */
  models: Model[]
};