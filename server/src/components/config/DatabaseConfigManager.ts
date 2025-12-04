import EventEmitter from 'events';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { AppConfig } from '#types/appConfig';
import type { Provider } from '#types/provider';
import logger from '#types/logger';

/**
 * Manages application configuration using a LowDB JSON file.
 */
export class JSONConfigManager {
  private static instance: JSONConfigManager | null = null;
  public events = new EventEmitter();
  private db: Low<AppConfig>;
  private config: AppConfig;

  private constructor(dbPath: string) {
    logger.info(`Loading DB from: ${dbPath}`);
    const adapter = new JSONFile<AppConfig>(dbPath);
    this.db = new Low(adapter,  { providers: [], models: []});
    this.config = { providers: [], models: []};
  }

  public static async initialize(databasePath: string): Promise<JSONConfigManager> {
    if (JSONConfigManager.instance) {
      throw new Error('DatabaseConfigManager is already initialized');
    }

    const instance = new JSONConfigManager(databasePath);
    await instance.db.read();

    if (instance.db.data === null) {
      instance.db.data =  { providers: [], models: []};
      await instance.db.write();
    }

    instance.config = instance.db.data;
    logger.info(`Loaded ${instance.config.providers.length} Providers`)
    logger.info(`Loaded ${instance.config.models.length} Models`)
    JSONConfigManager.instance = instance;
    return instance;
  }

  public static getInstance(): JSONConfigManager {
    if (!JSONConfigManager.instance) {
      throw new Error('DatabaseConfigManager has not been initialized. Call initialize() first.');
    }
    return JSONConfigManager.instance;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getProviders(): Provider[] {
    return this.config.providers;
  }

  public async updateConfig(newConfig: AppConfig): Promise<void> {
    this.config = newConfig;
    Object.assign(this.db.data, newConfig);
    await this.db.write();
    logger.debug(`Updated DB`);
    this.events.emit('configUpdated', this.config);
  }

  public async reloadConfig(): Promise<void> {
    await this.db.read();
    this.config = this.db.data;
    logger.debug(`Reloaded DB`);
    this.events.emit('configUpdated', this.config);
  }
}
