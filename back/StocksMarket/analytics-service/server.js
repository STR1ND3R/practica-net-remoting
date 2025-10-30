import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../shared/config.js';
import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';
import AnalyticsEngine from './analytics-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createServiceLogger('ANALYTICS-SERVICE');

const PROTO_PATH = join(__dirname, '..', 'protos', 'analytics.proto');

// Load proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const analyticsProto = grpc.loadPackageDefinition(packageDefinition).analytics;

// Initialize analytics engine
const analyticsEngine = new AnalyticsEngine();

/**
 * Get top traded stocks
 */
async function getTopTradedStocks(call, callback) {
  const { limit, time_period } = call.request;

  try {
    const result = await analyticsEngine.getTopTradedStocks(
      limit || 10,
      time_period || 86400000
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get top traded stocks', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get most volatile stocks
 */
async function getMostVolatileStocks(call, callback) {
  const { limit, time_period } = call.request;

  try {
    const result = await analyticsEngine.getMostVolatileStocks(
      limit || 10,
      time_period || 86400000
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get volatile stocks', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get market statistics
 */
async function getMarketStats(call, callback) {
  try {
    const result = await analyticsEngine.getMarketStats();
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get market stats', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get investor performance
 */
async function getInvestorPerformance(call, callback) {
  const { investor_id } = call.request;

  try {
    const result = await analyticsEngine.getInvestorPerformance(investor_id);
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get investor performance', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Predict price movement
 */
async function predictPrice(call, callback) {
  const { stock_symbol, time_horizon } = call.request;

  try {
    const result = await analyticsEngine.predictPrice(
      stock_symbol,
      time_horizon || 60
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to predict price', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Record trade
 */
async function recordTrade(call, callback) {
  const { stock_symbol, order_type, quantity, price, investor_id, timestamp } = call.request;

  try {
    const result = await analyticsEngine.recordTrade(
      stock_symbol,
      order_type,
      quantity,
      price,
      investor_id,
      timestamp
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to record trade', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get trading volume
 */
async function getTradingVolume(call, callback) {
  const { stock_symbol, start_time, end_time, interval } = call.request;

  try {
    const result = await analyticsEngine.getTradingVolume(
      stock_symbol,
      start_time,
      end_time,
      interval
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get trading volume', { error: err.message });
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

    // Create gRPC server
    const server = new grpc.Server();

    server.addService(analyticsProto.AnalyticsService.service, {
      GetTopTradedStocks: getTopTradedStocks,
      GetMostVolatileStocks: getMostVolatileStocks,
      GetMarketStats: getMarketStats,
      GetInvestorPerformance: getInvestorPerformance,
      PredictPrice: predictPrice,
      RecordTrade: recordTrade,
      GetTradingVolume: getTradingVolume
    });

    const address = `0.0.0.0:${config.analyticsService.port}`;
    
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          logger.error('Failed to bind server', { error: err.message });
          return;
        }
        
        server.start();
        logger.info(`Analytics Service started on ${address}`);
      }
    );

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Analytics Service...');
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

