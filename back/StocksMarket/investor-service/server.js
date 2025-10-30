import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../shared/config.js';
import { createServiceLogger } from '../shared/logger.js';
import { createPriceClient } from '../shared/grpc-clients.js';
import database from '../shared/database.js';
import PortfolioManager from './portfolio-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createServiceLogger('INVESTOR-SERVICE');

const PROTO_PATH = join(__dirname, '..', 'protos', 'investor.proto');

// Load proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const investorProto = grpc.loadPackageDefinition(packageDefinition).investor;

// Initialize portfolio manager
const portfolioManager = new PortfolioManager();

// Price service client
let priceClient;

/**
 * Register investor
 */
async function registerInvestor(call, callback) {
  const { name, email, initial_balance } = call.request;

  try {
    const result = await portfolioManager.registerInvestor(name, email, initial_balance);
    callback(null, result);
  } catch (err) {
    logger.error('Failed to register investor', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get investor
 */
async function getInvestor(call, callback) {
  const { investor_id } = call.request;

  try {
    const investor = await portfolioManager.getInvestor(investor_id);
    callback(null, investor);
  } catch (err) {
    logger.error('Failed to get investor', { error: err.message });
    callback({
      code: grpc.status.NOT_FOUND,
      message: err.message
    });
  }
}

/**
 * Update balance
 */
async function updateBalance(call, callback) {
  const { investor_id, amount, reason } = call.request;

  try {
    const result = await portfolioManager.updateBalance(investor_id, amount, reason);
    callback(null, result);
  } catch (err) {
    logger.error('Failed to update balance', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get portfolio
 */
async function getPortfolio(call, callback) {
  const { investor_id } = call.request;

  try {
    // Get current prices for stocks in portfolio
    const holdings = await database.query(
      'SELECT DISTINCT stock_symbol FROM portfolio WHERE investor_id = ?',
      [investor_id]
    );

    const currentPrices = {};
    
    if (holdings.length > 0) {
      const stockSymbols = holdings.map(h => h.stock_symbol);
      
      // Get prices from price service
      priceClient.GetPrices({ stock_symbols: stockSymbols }, (err, response) => {
        if (!err && response && response.prices) {
          response.prices.forEach(price => {
            currentPrices[price.stock_symbol] = price.current_price;
          });
        }

        portfolioManager.getPortfolio(investor_id, currentPrices)
          .then(portfolio => callback(null, portfolio))
          .catch(err => {
            logger.error('Failed to get portfolio', { error: err.message });
            callback({
              code: grpc.status.INTERNAL,
              message: err.message
            });
          });
      });
    } else {
      const portfolio = await portfolioManager.getPortfolio(investor_id, currentPrices);
      callback(null, portfolio);
    }
  } catch (err) {
    logger.error('Failed to get portfolio', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Update portfolio
 */
async function updatePortfolio(call, callback) {
  const { investor_id, stock_symbol, quantity_change, price, transaction_id } = call.request;

  try {
    const result = await portfolioManager.updatePortfolio(
      investor_id,
      stock_symbol,
      quantity_change,
      price,
      transaction_id
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to update portfolio', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Get transaction history
 */
async function getTransactionHistory(call, callback) {
  const { investor_id, limit, start_time, end_time } = call.request;

  try {
    const result = await portfolioManager.getTransactionHistory(
      investor_id,
      limit,
      start_time,
      end_time
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to get transaction history', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Validate order
 */
async function validateOrder(call, callback) {
  const { investor_id, stock_symbol, order_type, quantity, price } = call.request;

  try {
    const result = await portfolioManager.validateOrder(
      investor_id,
      stock_symbol,
      order_type,
      quantity,
      price
    );
    callback(null, result);
  } catch (err) {
    logger.error('Failed to validate order', { error: err.message });
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

    // Initialize price client
    priceClient = createPriceClient();

    // Create gRPC server
    const server = new grpc.Server();

    server.addService(investorProto.InvestorService.service, {
      RegisterInvestor: registerInvestor,
      GetInvestor: getInvestor,
      UpdateBalance: updateBalance,
      GetPortfolio: getPortfolio,
      UpdatePortfolio: updatePortfolio,
      GetTransactionHistory: getTransactionHistory,
      ValidateOrder: validateOrder
    });

    const address = `0.0.0.0:${config.investorService.port}`;
    
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          logger.error('Failed to bind server', { error: err.message });
          return;
        }
        
        server.start();
        logger.info(`Investor Service started on ${address}`);
      }
    );

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Investor Service...');
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

