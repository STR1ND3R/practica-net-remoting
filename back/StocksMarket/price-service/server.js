import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../shared/config.js';
import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';
import PriceManager from './price-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createServiceLogger('PRICE-SERVICE');

const PROTO_PATH = join(__dirname, '..', 'protos', 'price.proto');

// Load proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const priceProto = grpc.loadPackageDefinition(packageDefinition).price;

// Initialize price manager
const priceManager = new PriceManager();

/**
 * Get price for a stock
 */
async function getPrice(call, callback) {
  const { stock_symbol } = call.request;

  try {
    const price = await priceManager.getPrice(stock_symbol);
    callback(null, price);
  } catch (err) {
    logger.error('Failed to get price', { error: err.message });
    callback({
      code: grpc.status.NOT_FOUND,
      message: err.message
    });
  }
}

/**
 * Get prices for multiple stocks
 */
async function getPrices(call, callback) {
  const { stock_symbols } = call.request;

  try {
    const prices = await priceManager.getPrices(stock_symbols);
    callback(null, { prices });
  } catch (err) {
    logger.error('Failed to get prices', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Update price after trade
 */
async function updatePrice(call, callback) {
  const { stock_symbol, trade_price, trade_volume, is_buy } = call.request;

  try {
    const result = await priceManager.updatePrice(
      stock_symbol,
      trade_price,
      trade_volume,
      is_buy
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to update price', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Stream price updates
 */
function streamPrices(call) {
  const { stock_symbols } = call.request;
  
  logger.info('New price stream subscriber', { symbols: stock_symbols });

  const unsubscribe = priceManager.subscribe((priceUpdate) => {
    // Filter by stock symbols if specified
    if (stock_symbols.length > 0 && !stock_symbols.includes(priceUpdate.stock_symbol)) {
      return;
    }

    try {
      call.write(priceUpdate);
    } catch (err) {
      logger.error('Failed to write to price stream', { error: err.message });
    }
  });

  call.on('cancelled', () => {
    logger.info('Price stream cancelled');
    unsubscribe();
  });

  call.on('error', (err) => {
    logger.error('Price stream error', { error: err.message });
    unsubscribe();
  });
}

/**
 * Get price history
 */
async function getPriceHistory(call, callback) {
  const { stock_symbol, start_time, end_time, limit } = call.request;

  try {
    const history = await priceManager.getPriceHistory(
      stock_symbol,
      start_time,
      end_time,
      limit
    );
    callback(null, history);
  } catch (err) {
    logger.error('Failed to get price history', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Initialize stock
 */
async function initializeStock(call, callback) {
  const { stock_symbol, initial_price, company_name } = call.request;

  try {
    const result = await priceManager.initializeStock(
      stock_symbol,
      initial_price,
      company_name
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to initialize stock', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Start the gRPC server
 */
async function startServer() {
  try {
    // Initialize database
    await database.initialize();

    // Initialize stocks with starting prices
    await priceManager.initializeStocks();

    // Create gRPC server
    const server = new grpc.Server();

    server.addService(priceProto.PriceService.service, {
      GetPrice: getPrice,
      GetPrices: getPrices,
      UpdatePrice: updatePrice,
      StreamPrices: streamPrices,
      GetPriceHistory: getPriceHistory,
      InitializeStock: initializeStock
    });

    const address = `0.0.0.0:${config.priceService.port}`;
    
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          logger.error('Failed to bind server', { error: err.message });
          return;
        }
        
        server.start();
        logger.info(`Price Service started on ${address}`);
      }
    );

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Price Service...');
      server.tryShutdown(async () => {
        await database.close();
        process.exit(0);
      });
    });

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Start the server
startServer();

