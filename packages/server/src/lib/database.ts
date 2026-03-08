import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import fs from 'fs';
import path from 'path';
import { dbConfig } from '../config';
import logger from '../utils/logger';

class Database {
  private static instance: Database;
  private db: sqlite.Database | null = null;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async open(): Promise<sqlite.Database> {
    if (this.db) {
      return this.db;
    }

    try {
      const dbDir = path.dirname(dbConfig.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info(`Created database directory: ${dbDir}`);
      }

      logger.info(`Opening database at ${dbConfig.dbPath}`);
      const openedDb = await sqlite.open({
        filename: dbConfig.dbPath,
        driver: sqlite3.Database,
      });

      await openedDb.run('PRAGMA foreign_keys = ON');
      logger.info('Foreign key support enabled.');

      this.db = openedDb;
      return this.db;
    } catch (error) {
      logger.error('Error opening database:', error);
      throw error;
    }
  }

  public async initializeSchema(): Promise<void> {
    try {
      const currentDb = await this.getDb();

      const schemaPath = dbConfig.schemaPath;
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema file not found at ${schemaPath}`);
      }
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await currentDb.exec(schema);
      logger.info('Database schema initialized successfully.');
    } catch (error) {
      logger.error('Error initializing database schema:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (!this.db) {
      return;
    }
    try {
      await this.db.close();
      this.db = null;
      logger.info('Database connection closed successfully.');
    } catch (error) {
      logger.error('Error closing database:', error);
      throw error;
    }
  }

  public async getDb(): Promise<sqlite.Database> {
    if (!this.db) {
      await this.open();
    }
    return this.db!;
  }
}

const databaseInstance = Database.getInstance();

export const getDb = (): Promise<sqlite.Database> => databaseInstance.getDb();

export const openDatabase = (): Promise<sqlite.Database> => databaseInstance.open();
export const initializeDatabase = (): Promise<void> => databaseInstance.initializeSchema();
export const closeDatabase = (): Promise<void> => databaseInstance.close();
