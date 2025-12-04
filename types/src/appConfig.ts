import type { Provider } from './provider.js';

/**
 * Type definition for the main application configuration file (`config.json`).
 * Defines the overall structure of the config.
 */
export type AppConfig = {
  /** A list of all configured LLM providers. */
  providers: Provider[];

  /** 
   * The logging level for the application.
   * Controls the verbosity of server logs.
   */
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
};