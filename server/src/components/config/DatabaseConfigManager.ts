import EventEmitter from 'events';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { AppConfig } from '#types/appConfig';
import type { Provider } from '#types/provider';
import { IConfigManager } from './IConfigManager.js';

/**
 * Manages application configuration using a LowDB JSON file.
 */
export class DatabaseConfigManager implements IConfigManager {
  public events = new EventEmitter();
  private db: Low<AppConfig>;
  private config: AppConfig;

  private constructor(dbPath: string) {
    const adapter = new JSONFile<AppConfig>(dbPath);
    // Set default data if the file doesn't exist or is empty
    this.db = new Low(adapter, { providers: []});
    this.config = { providers: []};
  }

  public static async initialize(databasePath: string): Promise<DatabaseConfigManager> {
    const instance = new DatabaseConfigManager(databasePath);

    await instance.db.read();

    // If the database file is new, it will be null, so we should write the default.
    if (instance.db.data === null) {
      instance.db.data = { providers: []};
      await instance.db.write();
    }


    // Validate the loaded configuration
    instance.config = instance.db.data;
    return instance;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getProviders(): Provider[] {
    return this.config.providers;
  }

  public async updateConfig(newConfig: AppConfig): Promise<void> {
    // Validate the new configuration before updating
    const validatedConfig = newConfig;

    this.config = validatedConfig;
    Object.assign(this.db.data, validatedConfig);
    await this.db.write();

    this.events.emit('configUpdated', this.config);
  }

  public async reloadConfig(): Promise<void> {
    
    // Re-read the configuration from disk
    await this.db.read();
    

    // Validate and update the config
    this.config = this.db.data;
    
    // Emit the configUpdated event so other components can react
    this.events.emit('configUpdated', this.config);
  }
}