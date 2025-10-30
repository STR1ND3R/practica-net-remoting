import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../shared/config.js';
import { createServiceLogger } from '../shared/logger.js';
import { createPriceClient, createInvestorClient, createAnalyticsClient } from '../shared/grpc-clients.js';
import database from '../shared/database.js';
import MatchingEngine from './matching-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createServiceLogger('MARKET-SERVICE');

const PROTO_PATH = join(__dirname, '..', 'protos', 'market.proto');

// Load proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const marketProto = grpc.loadPackageDefinition(packageDefinition).market;

// Initialize matching engine
const matchingEngine = new MatchingEngine();

// Market state
let marketState = 'OPEN'; // OPEN, CLOSED, PAUSED

// gRPC service clients
let priceClient;
let investorClient;
let analyticsClient;

/**
 * Place an order
 */
async function placeOrder(call, callback) {
  const { investor_id, stock_symbol, order_type, quantity, price } = call.request;

  try {
    // Validate market state
    if (marketState !== 'OPEN') {
      return callback(null, {
        order_id: '',
        success: false,
        message: `Market is ${marketState}`,
        status: 'REJECTED'
      });
    }

    // Validate with investor service
    const validation = await new Promise((resolve, reject) => {
      investorClient.ValidateOrder({
        investor_id,
        stock_symbol,
        order_type: order_type === 0 ? 'BUY' : 'SELL',
        quantity,
        price
      }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });

    if (!validation.valid) {
      return callback(null, {
        order_id: '',
        success: false,
        message: validation.message,
        status: 'REJECTED'
      });
    }

    // Create order
    const order = {
      order_id: uuidv4(),
      investor_id,
      stock_symbol,
      order_type,
      quantity,
      price,
      filled_quantity: 0,
      status: 'PENDING',
      created_at: Date.now(),
      updated_at: Date.now()
    };

    // Save order to database
    await database.run(
      `INSERT INTO orders (order_id, investor_id, stock_symbol, order_type, quantity, price, filled_quantity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.order_id, order.investor_id, order.stock_symbol, 
       order_type === 0 ? 'BUY' : 'SELL', order.quantity, order.price,
       order.filled_quantity, order.status, order.created_at, order.updated_at]
    );

    // Add to matching engine
    const executions = matchingEngine.addOrder(order);

    // Update price based on order placement (market sentiment)
    // Even if order doesn't execute, it shows buying/selling pressure
    if (executions.length === 0) {
      // No execution, but order was placed - update price based on order book pressure
      // Use smaller impact than actual trades (30% of normal impact)
      const isBuyOrder = order_type === 0;
      
      // Get current price for market orders
      let orderPrice = price;
      if (price === 0) {
        // Market order - get current market price
        priceClient.GetPrice({ stock_symbol }, (err, priceData) => {
          if (!err && priceData) {
            priceClient.UpdatePrice({
              stock_symbol,
              trade_price: priceData.current_price,
              trade_volume: Math.floor(quantity * 0.3), // Reduced impact
              is_buy: isBuyOrder
            }, (err) => {
              if (err) logger.error('Failed to update price from order placement', { error: err.message });
            });
          }
        });
      } else {
        // Limit order - use the order price
        priceClient.UpdatePrice({
          stock_symbol,
          trade_price: orderPrice,
          trade_volume: Math.floor(quantity * 0.3), // Reduced impact
          is_buy: isBuyOrder
        }, (err) => {
          if (err) logger.error('Failed to update price from order placement', { error: err.message });
        });
      }
    }

    // Process executions
    for (const execution of executions) {
      await processExecution(execution);
    }

    // Get updated order status
    const updatedOrder = matchingEngine.getOrderStatus(order.order_id);

    callback(null, {
      order_id: order.order_id,
      success: true,
      message: 'Order placed successfully',
      status: updatedOrder.status
    });

    logger.info('Order placed', {
      orderId: order.order_id,
      symbol: stock_symbol,
      executions: executions.length
    });

  } catch (err) {
    logger.error('Failed to place order', { error: err.message });
    callback(null, {
      order_id: '',
      success: false,
      message: err.message,
      status: 'REJECTED'
    });
  }
}

/**
 * Process trade execution
 */
async function processExecution(execution) {
  const { stock_symbol, quantity, price, buyer_id, seller_id, buy_order_id, sell_order_id } = execution;

  try {
    // Get the buyer and seller orders to determine market pressure
    const buyOrder = matchingEngine.orders[buy_order_id];
    const sellOrder = matchingEngine.orders[sell_order_id];
    
    // Determine if this trade represents buying or selling pressure
    // Market orders (price = 0) indicate aggressive takers
    // If buyer placed market order, it's buying pressure (price goes up)
    // If seller placed market order, it's selling pressure (price goes down)
    // If both are limit orders, the most recent order determines the direction
    let isBuyPressure = true;
    
    if (buyOrder && sellOrder) {
      if (buyOrder.price === 0 && sellOrder.price !== 0) {
        // Buyer crossed the spread with market order - buying pressure
        isBuyPressure = true;
      } else if (sellOrder.price === 0 && buyOrder.price !== 0) {
        // Seller crossed the spread with market order - selling pressure
        isBuyPressure = false;
      } else if (buyOrder.created_at > sellOrder.created_at) {
        // Buyer's order was more recent - buying pressure
        isBuyPressure = true;
      } else {
        // Seller's order was more recent - selling pressure
        isBuyPressure = false;
      }
    }
    
    // Update price service with correct direction
    priceClient.UpdatePrice({
      stock_symbol,
      trade_price: price,
      trade_volume: quantity,
      is_buy: isBuyPressure
    }, (err) => {
      if (err) logger.error('Failed to update price', { error: err.message });
    });

    // Update buyer portfolio
    investorClient.UpdatePortfolio({
      investor_id: buyer_id,
      stock_symbol,
      quantity_change: quantity,
      price,
      transaction_id: uuidv4()
    }, (err) => {
      if (err) logger.error('Failed to update buyer portfolio', { error: err.message });
    });

    // Update buyer balance (deduct)
    investorClient.UpdateBalance({
      investor_id: buyer_id,
      amount: -(quantity * price),
      reason: `Purchase of ${quantity} shares of ${stock_symbol}`
    }, (err) => {
      if (err) logger.error('Failed to update buyer balance', { error: err.message });
    });

    // Update seller portfolio
    investorClient.UpdatePortfolio({
      investor_id: seller_id,
      stock_symbol,
      quantity_change: -quantity,
      price,
      transaction_id: uuidv4()
    }, (err) => {
      if (err) logger.error('Failed to update seller portfolio', { error: err.message });
    });

    // Update seller balance (add)
    investorClient.UpdateBalance({
      investor_id: seller_id,
      amount: quantity * price,
      reason: `Sale of ${quantity} shares of ${stock_symbol}`
    }, (err) => {
      if (err) logger.error('Failed to update seller balance', { error: err.message });
    });

    // Record trade in analytics
    analyticsClient.RecordTrade({
      stock_symbol,
      order_type: 'BUY',
      quantity,
      price,
      investor_id: buyer_id,
      timestamp: Date.now()
    }, () => {});

    analyticsClient.RecordTrade({
      stock_symbol,
      order_type: 'SELL',
      quantity,
      price,
      investor_id: seller_id,
      timestamp: Date.now()
    }, () => {});

    logger.info('Execution processed', {
      symbol: stock_symbol,
      quantity,
      price,
      buyer: buyer_id,
      seller: seller_id
    });

  } catch (err) {
    logger.error('Failed to process execution', { error: err.message });
  }
}

/**
 * Cancel an order
 */
function cancelOrder(call, callback) {
  const { order_id, investor_id } = call.request;

  try {
    const result = matchingEngine.cancelOrder(order_id, investor_id);
    callback(null, result);
  } catch (err) {
    logger.error('Failed to cancel order', { error: err.message });
    callback(null, {
      success: false,
      message: err.message
    });
  }
}

/**
 * Get order status
 */
function getOrderStatus(call, callback) {
  const { order_id } = call.request;

  try {
    const status = matchingEngine.getOrderStatus(order_id);
    
    if (!status) {
      return callback(null, {
        order_id,
        status: 'REJECTED',
        filled_quantity: 0,
        remaining_quantity: 0,
        average_price: 0
      });
    }

    callback(null, status);
  } catch (err) {
    logger.error('Failed to get order status', { error: err.message });
    callback({
      code: grpc.status.INTERNAL,
      message: err.message
    });
  }
}

/**
 * Stream market events
 */
function streamMarketEvents(call) {
  const { stock_symbols } = call.request;
  
  logger.info('New market events stream subscriber', { symbols: stock_symbols });

  const unsubscribe = matchingEngine.subscribe((event) => {
    // Filter by stock symbols if specified
    if (stock_symbols.length > 0 && !stock_symbols.includes(event.stock_symbol)) {
      return;
    }

    try {
      call.write(event);
    } catch (err) {
      logger.error('Failed to write to stream', { error: err.message });
    }
  });

  call.on('cancelled', () => {
    logger.info('Market events stream cancelled');
    unsubscribe();
  });

  call.on('error', (err) => {
    logger.error('Market events stream error', { error: err.message });
    unsubscribe();
  });
}

/**
 * Get market state
 */
function getMarketState(call, callback) {
  callback(null, {
    state: marketState === 'OPEN' ? 0 : marketState === 'CLOSED' ? 1 : 2
  });
}

/**
 * Set market state
 */
function setMarketState(call, callback) {
  const { state } = call.request;
  
  const stateMap = { 0: 'OPEN', 1: 'CLOSED', 2: 'PAUSED' };
  marketState = stateMap[state] || 'OPEN';

  logger.info('Market state changed', { newState: marketState });

  callback(null, {
    success: true,
    message: `Market state set to ${marketState}`
  });
}

/**
 * Get order book
 */
function getOrderBook(call, callback) {
  const { stock_symbol } = call.request;

  try {
    const orderBook = matchingEngine.getOrderBook(stock_symbol);
    callback(null, orderBook);
  } catch (err) {
    logger.error('Failed to get order book', { error: err.message });
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

    // Initialize gRPC clients
    priceClient = createPriceClient();
    investorClient = createInvestorClient();
    analyticsClient = createAnalyticsClient();

    // Create gRPC server
    const server = new grpc.Server();

    server.addService(marketProto.MarketService.service, {
      PlaceOrder: placeOrder,
      CancelOrder: cancelOrder,
      GetOrderStatus: getOrderStatus,
      StreamMarketEvents: streamMarketEvents,
      GetMarketState: getMarketState,
      SetMarketState: setMarketState,
      GetOrderBook: getOrderBook
    });

    const address = `0.0.0.0:${config.marketService.port}`;
    
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          logger.error('Failed to bind server', { error: err.message });
          return;
        }
        
        server.start();
        logger.info(`Market Service started on ${address}`);
      }
    );

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Market Service...');
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

