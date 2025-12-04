import EventEmitter from 'events';
import type { AppConfig } from '#types/appConfig';
import type { Provider } from '#types/provider';

export interface IConfigManager {
  events: EventEmitter;
  getConfig(): AppConfig;
  getProviders(): Provider[];
  updateConfig(newConfig: AppConfig): Promise<void>;
  reloadConfig(): Promise<void>;
  // Rate limiting state persistence methods have been removed
}