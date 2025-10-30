import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { config } from './config.js';
import { createServiceLogger } from './logger.js';
import fs from 'fs';
import path from 'path';

const logger = createServiceLogger('DATABASE');

class Database {
  constructor() {
    this.db = null;
    this.isClosing = false;
    this.isClosed = false;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Ensure logs directory exists
      if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
      }

      this.db = new sqlite3.Database(config.database.path, (err) => {
        if (err) {
          logger.error('Failed to connect to database', { error: err.message });
          reject(err);
        } else {
          logger.info('Connected to SQLite database', { path: config.database.path });
          this.createTables()
            .then(() => resolve())
            .catch((err) => reject(err));
        }
      });
    });
  }

  async createTables() {
    const run = promisify(this.db.run.bind(this.db));

    try {
      // Stocks table
      await run(`
        CREATE TABLE IF NOT EXISTS stocks (
          symbol TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          current_price REAL NOT NULL,
          open_price REAL NOT NULL,
          high_price REAL NOT NULL,
          low_price REAL NOT NULL,
          last_updated INTEGER NOT NULL
        )
      `);

      // Price history table
      await run(`
        CREATE TABLE IF NOT EXISTS price_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_symbol TEXT NOT NULL,
          price REAL NOT NULL,
          volume INTEGER NOT NULL,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (stock_symbol) REFERENCES stocks(symbol)
        )
      `);

      // Investors table
      await run(`
        CREATE TABLE IF NOT EXISTS investors (
          investor_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          balance REAL NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);

      // Portfolio table
      await run(`
        CREATE TABLE IF NOT EXISTS portfolio (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          investor_id TEXT NOT NULL,
          stock_symbol TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          average_price REAL NOT NULL,
          FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
          FOREIGN KEY (stock_symbol) REFERENCES stocks(symbol),
          UNIQUE(investor_id, stock_symbol)
        )
      `);

      // Transactions table
      await run(`
        CREATE TABLE IF NOT EXISTS transactions (
          transaction_id TEXT PRIMARY KEY,
          investor_id TEXT NOT NULL,
          stock_symbol TEXT NOT NULL,
          type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL,
          total_amount REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
          FOREIGN KEY (stock_symbol) REFERENCES stocks(symbol)
        )
      `);

      // Orders table
      await run(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id TEXT PRIMARY KEY,
          investor_id TEXT NOT NULL,
          stock_symbol TEXT NOT NULL,
          order_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL,
          filled_quantity INTEGER DEFAULT 0,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
          FOREIGN KEY (stock_symbol) REFERENCES stocks(symbol)
        )
      `);

      // Webhooks table
      await run(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          events TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL
        )
      `);

      // Analytics trades table
      await run(`
        CREATE TABLE IF NOT EXISTS analytics_trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_symbol TEXT NOT NULL,
          order_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL,
          investor_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `);

      // Create indexes for better query performance
      await run('CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(stock_symbol)');
      await run('CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp)');
      await run('CREATE INDEX IF NOT EXISTS idx_portfolio_investor ON portfolio(investor_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_transactions_investor ON transactions(investor_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)');
      await run('CREATE INDEX IF NOT EXISTS idx_orders_investor ON orders(investor_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
      await run('CREATE INDEX IF NOT EXISTS idx_analytics_trades_symbol ON analytics_trades(stock_symbol)');
      await run('CREATE INDEX IF NOT EXISTS idx_analytics_trades_timestamp ON analytics_trades(timestamp)');

      logger.info('Database tables created successfully');
    } catch (err) {
      logger.error('Failed to create tables', { error: err.message });
      throw err;
    }
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Get query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Run query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async close() {
    // Already closed or closing
    if (!this.db || this.isClosed || this.isClosing) {
      return;
    }

    this.isClosing = true;

    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err && !err.message.includes('closed')) {
          logger.error('Failed to close database', { error: err.message });
        } else if (!err) {
          logger.info('Database connection closed');
        }
        this.db = null;
        this.isClosed = true;
        this.isClosing = false;
        resolve();
      });
    });
  }
}

// Singleton instance
const database = new Database();

export default database;
export { Database };

