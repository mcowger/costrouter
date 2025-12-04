import EventEmitter from 'events';
import { AppConfig } from '#schemas/src/appConfig';
import { Provider } from '#schemas/src/provider';

export interface IConfigManager {
  events: EventEmitter;
  getConfig(): AppConfig;
  getProviders(): Provider[];
  updateConfig(newConfig: AppConfig): Promise<void>;
  reloadConfig(): Promise<void>;
  // Rate limiting state persistence methods have been removed
}