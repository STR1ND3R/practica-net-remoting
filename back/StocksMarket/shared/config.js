import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

export const config = {
  // Service Ports
  marketService: {
    host: process.env.MARKET_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.MARKET_SERVICE_PORT || '50051')
  },
  priceService: {
    host: process.env.PRICE_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.PRICE_SERVICE_PORT || '50052')
  },
  investorService: {
    host: process.env.INVESTOR_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.INVESTOR_SERVICE_PORT || '50053')
  },
  analyticsService: {
    host: process.env.ANALYTICS_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.ANALYTICS_SERVICE_PORT || '50054')
  },
  webhookService: {
    port: parseInt(process.env.WEBHOOK_SERVICE_PORT || '8080')
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || './data/stockmarket.db'
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Market Configuration
  market: {
    initialStocks: process.env.INITIAL_STOCKS || 'AAPL:150.0:Apple Inc.,GOOGL:2800.0:Alphabet Inc.,MSFT:330.0:Microsoft Corp.',
    priceVolatilityFactor: parseFloat(process.env.PRICE_VOLATILITY_FACTOR || '0.001'),
    openHour: parseInt(process.env.MARKET_OPEN_HOUR || '9'),
    closeHour: parseInt(process.env.MARKET_CLOSE_HOUR || '16')
  }
};

export default config;

