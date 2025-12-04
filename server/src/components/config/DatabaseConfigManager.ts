import EventEmitter from 'events';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { AppConfig } from '#types/appConfig';
import type { Provider } from '#types/provider';
import logger from '#types/logger';

export interface IConfigManager {
  events: EventEmitter;
  getConfig(): AppConfig;
  getProviders(): Provider[];
  updateConfig(newConfig: AppConfig): Promise<void>;
  reloadConfig(): Promise<void>;
}

/**
 * Manages application configuration using a LowDB JSON file.
 */
export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager | null = null;
  public events = new EventEmitter();
  private db: Low<AppConfig>;
  private config: AppConfig;

  private constructor(dbPath: string) {
    logger.info(`Loading DB from: ${dbPath}`);
    const adapter = new JSONFile<AppConfig>(dbPath);
    this.db = new Low(adapter, { providers: []});
    this.config = { providers: []};
  }

  public static async initialize(databasePath: string): Promise<DatabaseConfigManager> {
    if (DatabaseConfigManager.instance) {
      throw new Error('DatabaseConfigManager is already initialized');
    }

    const instance = new DatabaseConfigManager(databasePath);
    await instance.db.read();

    if (instance.db.data === null) {
      instance.db.data = { providers: []};
      await instance.db.write();
    }

    instance.config = instance.db.data;
    DatabaseConfigManager.instance = instance;
    return instance;
  }

  public static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      throw new Error('DatabaseConfigManager has not been initialized. Call initialize() first.');
    }
    return DatabaseConfigManager.instance;
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
