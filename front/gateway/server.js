/**
 * REST API Gateway Service
 * 
 * This service acts as a bridge between the React frontend (HTTP/REST)
 * and the backend gRPC microservices.
 * 
 * Since browsers cannot directly call gRPC services, this gateway:
 * 1. Accepts HTTP REST requests from the frontend
 * 2. Converts them to gRPC calls
 * 3. Returns JSON responses
 */

import express from 'express';
import cors from 'cors';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.GATEWAY_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const GRPC_SERVICES = {
  MARKET: process.env.MARKET_SERVICE_HOST || 'localhost:50051',
  PRICE: process.env.PRICE_SERVICE_HOST || 'localhost:50052',
  INVESTOR: process.env.INVESTOR_SERVICE_HOST || 'localhost:50053',
  ANALYTICS: process.env.ANALYTICS_SERVICE_HOST || 'localhost:50054',
};

// Load proto files (adjust paths based on your backend structure)
const PROTO_PATH = process.env.PROTO_PATH || join(__dirname, '../../backend/protos');

// Proto loader options
const packageDefinition = (protoFile) => {
  return protoLoader.loadSync(join(PROTO_PATH, protoFile), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
};

// Initialize gRPC clients (with error handling for missing proto files)
let marketClient, priceClient, investorClient, analyticsClient;

try {
  // Note: These are placeholders. You'll need to adjust based on your actual proto definitions
  console.log('Initializing gRPC clients...');
  console.log('Note: Proto files expected at:', PROTO_PATH);
  console.log('If proto files are not found, the gateway will use mock responses.');
  
  // For now, we'll create mock clients that return sample data
  // Once you have the actual backend running, uncomment and adjust the gRPC client initialization
  
  /*
  const marketProto = grpc.loadPackageDefinition(packageDefinition('market.proto'));
  const priceProto = grpc.loadPackageDefinition(packageDefinition('price.proto'));
  const investorProto = grpc.loadPackageDefinition(packageDefinition('investor.proto'));
  const analyticsProto = grpc.loadPackageDefinition(packageDefinition('analytics.proto'));

  marketClient = new marketProto.MarketService(
    GRPC_SERVICES.MARKET,
    grpc.credentials.createInsecure()
  );
  
  priceClient = new priceProto.PriceService(
    GRPC_SERVICES.PRICE,
    grpc.credentials.createInsecure()
  );
  
  investorClient = new investorProto.InvestorService(
    GRPC_SERVICES.INVESTOR,
    grpc.credentials.createInsecure()
  );
  
  analyticsClient = new analyticsProto.AnalyticsService(
    GRPC_SERVICES.ANALYTICS,
    grpc.credentials.createInsecure()
  );
  */
  
} catch (error) {
  console.warn('Warning: Could not load proto files. Using mock mode.');
  console.warn('Error:', error.message);
}

// ==================== MOCK DATA ====================
// This is sample data for testing the frontend without the backend
const mockStocks = [
  { stock_symbol: 'AAPL', company_name: 'Apple Inc.', current_price: 150.25, open_price: 149.50, high_price: 151.00, low_price: 148.75, change_percent: 0.50, volume: 45000000 },
  { stock_symbol: 'GOOGL', company_name: 'Alphabet Inc.', current_price: 2805.50, open_price: 2790.00, high_price: 2815.00, low_price: 2780.00, change_percent: 0.55, volume: 28000000 },
  { stock_symbol: 'MSFT', company_name: 'Microsoft Corp.', current_price: 330.75, open_price: 328.00, high_price: 332.50, low_price: 327.50, change_percent: 0.84, volume: 35000000 },
  { stock_symbol: 'TSLA', company_name: 'Tesla Inc.', current_price: 250.40, open_price: 255.00, high_price: 256.00, low_price: 248.00, change_percent: -1.80, volume: 52000000 },
  { stock_symbol: 'AMZN', company_name: 'Amazon.com Inc.', current_price: 3305.20, open_price: 3290.00, high_price: 3315.00, low_price: 3285.00, change_percent: 0.46, volume: 24000000 },
];

const mockInvestors = new Map();
const mockPortfolios = new Map(); // Store portfolios by investor_id

// SSE clients for real-time updates
const priceStreamClients = new Set();
const marketEventClients = new Set();

// ==================== HELPER FUNCTIONS ====================

// Broadcast price update to all SSE clients
const broadcastPriceUpdate = (stock) => {
  const data = JSON.stringify({
    type: 'PRICE_UPDATE',
    data: stock,
    timestamp: Date.now()
  });
  
  priceStreamClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending to client:', error);
      priceStreamClients.delete(client);
    }
  });
};

// Broadcast market event to all SSE clients
const broadcastMarketEvent = (event) => {
  const data = JSON.stringify({
    ...event,
    timestamp: Date.now()
  });
  
  marketEventClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending to client:', error);
      marketEventClients.delete(client);
    }
  });
};

// Update stock price based on trade (simulates backend price impact)
const updateStockPrice = (stock_symbol, quantity, is_buy, impact_factor = 1.0) => {
  const stock = mockStocks.find(s => s.stock_symbol === stock_symbol);
  if (!stock) return;
  
  const oldPrice = stock.current_price;
  const volatilityFactor = 0.001; // 0.1% base impact
  const volumeMultiplier = Math.log(1 + quantity / 100);
  const direction = is_buy ? 1 : -1;
  const randomFactor = 0.9 + Math.random() * 0.2; // ±10% variance
  
  // Calculate price change
  const priceChange = oldPrice * volatilityFactor * direction * volumeMultiplier * randomFactor * impact_factor;
  stock.current_price = Math.max(0.01, oldPrice + priceChange);
  
  // Update high/low
  stock.high_price = Math.max(stock.high_price, stock.current_price);
  stock.low_price = Math.min(stock.low_price, stock.current_price);
  
  // Update change percent
  stock.change_percent = ((stock.current_price - stock.open_price) / stock.open_price) * 100;
  
  // Update volume
  stock.volume += quantity;
  
  // Broadcast the update
  broadcastPriceUpdate(stock);
  
  return stock;
};
const asyncGrpcCall = (client, method, request) => {
  return new Promise((resolve, reject) => {
    client[method](request, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
};

const validateOrder = (investor_id, stock_symbol, order_type, quantity, price) => {
  // Get investor
  let investor = mockInvestors.get(investor_id);
  if (!investor) {
    investor = { investor_id, balance: 50000 };
  }
  
  // Get portfolio
  let portfolio = mockPortfolios.get(investor_id);
  if (!portfolio) {
    portfolio = {
      investor_id,
      holdings: [
        { stock_symbol: 'AAPL', quantity: 50, average_buy_price: 145.00, current_price: 150.25 },
        { stock_symbol: 'GOOGL', quantity: 10, average_buy_price: 2750.00, current_price: 2805.50 },
      ],
    };
  }
  
  // Get stock price
  const stock = mockStocks.find(s => s.stock_symbol === stock_symbol);
  if (!stock) {
    return { valid: false, message: 'Stock not found' };
  }
  
  const orderPrice = price > 0 ? price : stock.current_price;
  const totalCost = quantity * orderPrice;
  
  // Validate BUY order
  if (order_type === 'BUY' || order_type === 0) {
    if (investor.balance < totalCost) {
      return {
        valid: false,
        message: `Insufficient balance. Required: $${totalCost.toFixed(2)}, Available: $${investor.balance.toFixed(2)}`,
      };
    }
    return { valid: true, message: 'Buy order is valid' };
  }
  
  // Validate SELL order
  if (order_type === 'SELL' || order_type === 1) {
    const holding = portfolio.holdings.find(h => h.stock_symbol === stock_symbol);
    
    if (!holding || holding.quantity < quantity) {
      return {
        valid: false,
        message: `Insufficient shares. You have ${holding ? holding.quantity : 0} shares of ${stock_symbol}, trying to sell ${quantity}`,
      };
    }
    
    return { valid: true, message: 'Sell order is valid' };
  }
  
  return { valid: false, message: 'Invalid order type' };
};

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: Date.now(),
    grpcServices: GRPC_SERVICES,
  });
});

// ==================== SSE ENDPOINTS ====================

// Stream real-time price updates
app.get('/api/stream/prices', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add client to set
  priceStreamClients.add(res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Price stream connected' })}\n\n`);
  
  // Send current prices
  mockStocks.forEach(stock => {
    res.write(`data: ${JSON.stringify({ type: 'PRICE_UPDATE', data: stock, timestamp: Date.now() })}\n\n`);
  });
  
  // Remove client on disconnect
  req.on('close', () => {
    priceStreamClients.delete(res);
    console.log('Price stream client disconnected');
  });
});

// Stream real-time market events
app.get('/api/stream/market-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add client to set
  marketEventClients.add(res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Market events stream connected' })}\n\n`);
  
  // Remove client on disconnect
  req.on('close', () => {
    marketEventClients.delete(res);
    console.log('Market events client disconnected');
  });
});

// ==================== MARKET SERVICE ROUTES ====================
app.post('/api/market/orders', async (req, res) => {
  try {
    const { investor_id, stock_symbol, order_type, quantity, price } = req.body;
    
    // Validate first
    const validation = validateOrder(investor_id, stock_symbol, order_type, quantity, price);
    
    if (!validation.valid) {
      return res.json({
        success: false,
        message: validation.message,
      });
    }
    
    // Get investor and portfolio
    let investor = mockInvestors.get(investor_id);
    if (!investor) {
      investor = { investor_id, balance: 50000 };
      mockInvestors.set(investor_id, investor);
    }
    
    let portfolio = mockPortfolios.get(investor_id);
    if (!portfolio) {
      portfolio = {
        investor_id,
        holdings: [
          { stock_symbol: 'AAPL', quantity: 50, average_buy_price: 145.00, current_price: 150.25 },
          { stock_symbol: 'GOOGL', quantity: 10, average_buy_price: 2750.00, current_price: 2805.50 },
        ],
      };
      mockPortfolios.set(investor_id, portfolio);
    }
    
    // Determine if it's a buy or sell order
    const isBuy = order_type === 'BUY' || order_type === 0;
    
    // INSTANT PRICE UPDATE - Stage 1: Order Placement (30% impact)
    // This happens IMMEDIATELY when order is placed
    updateStockPrice(stock_symbol, quantity, isBuy, 0.3);
    
    // Broadcast order placed event
    broadcastMarketEvent({
      type: 'ORDER_PLACED',
      stock_symbol,
      order_type: isBuy ? 'BUY' : 'SELL',
      quantity,
      price: price || mockStocks.find(s => s.stock_symbol === stock_symbol).current_price,
      investor_id
    });
    
    // Get current stock price after initial impact
    const stock = mockStocks.find(s => s.stock_symbol === stock_symbol);
    const tradePrice = price > 0 ? price : stock.current_price;
    const totalValue = quantity * tradePrice;
    
    // Execute order
    if (isBuy) {
      // Buy order - deduct balance, add to portfolio
      investor.balance -= totalValue;
      
      const holding = portfolio.holdings.find(h => h.stock_symbol === stock_symbol);
      if (holding) {
        // Update average price
        const totalShares = holding.quantity + quantity;
        holding.average_buy_price = 
          ((holding.average_buy_price * holding.quantity) + (tradePrice * quantity)) / totalShares;
        holding.quantity = totalShares;
      } else {
        portfolio.holdings.push({
          stock_symbol,
          quantity,
          average_buy_price: tradePrice,
          current_price: stock.current_price,
        });
      }
    } else {
      // Sell order - add balance, remove from portfolio
      investor.balance += totalValue;
      
      const holding = portfolio.holdings.find(h => h.stock_symbol === stock_symbol);
      holding.quantity -= quantity;
      
      // Remove holding if quantity is 0
      if (holding.quantity === 0) {
        portfolio.holdings = portfolio.holdings.filter(h => h.stock_symbol !== stock_symbol);
      }
    }
    
    // FULL PRICE UPDATE - Stage 2: Trade Execution (100% impact)
    // This happens when trade actually executes
    updateStockPrice(stock_symbol, quantity, isBuy, 1.0);
    
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Broadcast order executed event
    broadcastMarketEvent({
      type: 'ORDER_EXECUTED',
      order_id: orderId,
      stock_symbol,
      order_type: isBuy ? 'BUY' : 'SELL',
      quantity,
      price: tradePrice,
      total_value: totalValue,
      investor_id
    });
    
    res.json({
      success: true,
      order_id: orderId,
      status: 'FILLED',
      message: `Order executed successfully. ${isBuy ? 'Bought' : 'Sold'} ${quantity} shares of ${stock_symbol} at $${tradePrice.toFixed(2)}`,
      executed_price: stock.current_price,
      price_change: stock.current_price - tradePrice,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/market/orders/:orderId', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/orders/:orderId', async (req, res) => {
  try {
    res.json({
      order_id: req.params.orderId,
      status: 'FILLED',
      filled_quantity: 10,
      average_price: 150.25,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/orderbook/:symbol', async (req, res) => {
  try {
    res.json({
      stock_symbol: req.params.symbol,
      bids: [
        { price: 149.50, quantity: 100 },
        { price: 149.25, quantity: 250 },
      ],
      asks: [
        { price: 150.75, quantity: 150 },
        { price: 151.00, quantity: 200 },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/state', async (req, res) => {
  try {
    res.json({
      state: 'OPEN',
      message: 'Market is currently open',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRICE SERVICE ROUTES ====================
// Note: Specific routes must come BEFORE dynamic routes with parameters
app.get('/api/prices/all', async (req, res) => {
  try {
    res.json({ stocks: mockStocks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/prices/batch', async (req, res) => {
  try {
    const { stockSymbols } = req.body;
    const stocks = mockStocks.filter(s => 
      stockSymbols.includes(s.stock_symbol)
    );
    res.json({ stocks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/prices/:symbol', async (req, res) => {
  try {
    const stock = mockStocks.find(s => s.stock_symbol === req.params.symbol.toUpperCase());
    if (stock) {
      res.json(stock);
    } else {
      res.status(404).json({ error: 'Stock not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/prices/:symbol/history', async (req, res) => {
  try {
    const stock = mockStocks.find(s => s.stock_symbol === req.params.symbol.toUpperCase());
    const prices = [];
    
    // Generate mock price history
    const now = Date.now();
    for (let i = 50; i >= 0; i--) {
      prices.push({
        timestamp: now - (i * 30 * 60 * 1000), // Every 30 minutes
        price: stock ? stock.current_price * (1 + (Math.random() - 0.5) * 0.02) : 100,
        volume: Math.floor(Math.random() * 1000000),
      });
    }
    
    res.json({ prices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INVESTOR SERVICE ROUTES ====================
app.post('/api/investors', async (req, res) => {
  try {
    const { name, email, initial_balance } = req.body;
    const investorId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const investor = {
      investor_id: investorId,
      name,
      email,
      balance: initial_balance || 10000,
      created_at: Date.now(),
    };
    
    mockInvestors.set(investorId, investor);
    
    res.json({
      success: true,
      investor_id: investorId,
      message: 'Investor registered successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investors/:investorId', async (req, res) => {
  try {
    let investor = mockInvestors.get(req.params.investorId);
    
    if (!investor) {
      // Create default investor
      investor = {
        investor_id: req.params.investorId,
        name: 'Demo Investor',
        email: 'demo@example.com',
        balance: 50000,
        created_at: Date.now() - 86400000,
      };
      mockInvestors.set(req.params.investorId, investor);
    }
    
    res.json(investor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/investors/:investorId/balance', async (req, res) => {
  try {
    const { amount, reason } = req.body;
    let investor = mockInvestors.get(req.params.investorId);
    
    if (!investor) {
      investor = {
        investor_id: req.params.investorId,
        name: 'Demo Investor',
        email: 'demo@example.com',
        balance: 50000,
        created_at: Date.now(),
      };
      mockInvestors.set(req.params.investorId, investor);
    }
    
    investor.balance += amount;
    res.json({
      success: true,
      new_balance: investor.balance,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investors/:investorId/portfolio', async (req, res) => {
  try {
    const investorId = req.params.investorId;
    let portfolio = mockPortfolios.get(investorId);
    
    // If no portfolio exists, create a default one with some initial holdings
    if (!portfolio) {
      portfolio = {
        investor_id: investorId,
        holdings: [
          {
            stock_symbol: 'AAPL',
            quantity: 50,
            average_buy_price: 145.00,
            current_price: 150.25,
          },
          {
            stock_symbol: 'GOOGL',
            quantity: 10,
            average_buy_price: 2750.00,
            current_price: 2805.50,
          },
        ],
        total_value: 35560.00,
      };
      mockPortfolios.set(investorId, portfolio);
    }
    
    // Update current prices from mockStocks
    portfolio.holdings.forEach(holding => {
      const stock = mockStocks.find(s => s.stock_symbol === holding.stock_symbol);
      if (stock) {
        holding.current_price = stock.current_price;
      }
    });
    
    // Recalculate total value
    portfolio.total_value = portfolio.holdings.reduce((sum, h) => 
      sum + (h.quantity * h.current_price), 0
    );
    
    res.json(portfolio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investors/:investorId/transactions', async (req, res) => {
  try {
    const now = Date.now();
    res.json({
      transactions: [
        {
          transaction_id: 'TXN-001',
          stock_symbol: 'AAPL',
          transaction_type: 'BUY',
          quantity: 50,
          price: 145.00,
          total_amount: 7250.00,
          timestamp: now - 3600000,
        },
        {
          transaction_id: 'TXN-002',
          stock_symbol: 'GOOGL',
          transaction_type: 'BUY',
          quantity: 10,
          price: 2750.00,
          total_amount: 27500.00,
          timestamp: now - 7200000,
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investors/validate-order', async (req, res) => {
  try {
    const { investor_id, stock_symbol, order_type, quantity, price } = req.body;
    const result = validateOrder(investor_id, stock_symbol, order_type, quantity, price);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ANALYTICS SERVICE ROUTES ====================
app.get('/api/analytics/top-traded', async (req, res) => {
  try {
    const stocks = mockStocks.map(s => ({
      ...s,
      total_volume: s.volume,
      trade_count: Math.floor(Math.random() * 1000),
    })).sort((a, b) => b.total_volume - a.total_volume);
    
    res.json({ stocks: stocks.slice(0, req.query.limit || 10) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/volatile', async (req, res) => {
  try {
    const stocks = mockStocks.map(s => ({
      ...s,
      volatility_percent: Math.abs(s.change_percent),
    })).sort((a, b) => b.volatility_percent - a.volatility_percent);
    
    res.json({ stocks: stocks.slice(0, req.query.limit || 10) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/market-stats', async (req, res) => {
  try {
    res.json({
      total_trades_today: 1523,
      total_volume_today: 184000000,
      active_investors: 247,
      active_stocks: mockStocks.length,
      market_trend: 0.45,
      market_sentiment: 'BULLISH',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/investor/:investorId/performance', async (req, res) => {
  try {
    res.json({
      investor_id: req.params.investorId,
      total_profit_loss: 1810.00,
      profit_loss_percent: 5.23,
      total_trades: 15,
      winning_trades: 10,
      losing_trades: 5,
      win_rate: 66.67,
      average_trade_size: 2500.00,
      risk_level: 'MEDIUM',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analytics/predict', async (req, res) => {
  try {
    const { stockSymbol } = req.body;
    const stock = mockStocks.find(s => s.stock_symbol === stockSymbol);
    
    if (stock) {
      const predictedChange = (Math.random() - 0.5) * 2; // -1% to +1%
      res.json({
        stock_symbol: stockSymbol,
        current_price: stock.current_price,
        predicted_price: stock.current_price * (1 + predictedChange / 100),
        predicted_change: predictedChange,
        confidence: 65 + Math.random() * 20,
        recommendation: predictedChange > 0.5 ? 'BUY' : predictedChange < -0.5 ? 'SELL' : 'HOLD',
      });
    } else {
      res.status(404).json({ error: 'Stock not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/volume/:symbol', async (req, res) => {
  try {
    const data = [];
    const now = Date.now();
    
    for (let i = 24; i >= 0; i--) {
      data.push({
        timestamp: now - (i * 3600000),
        volume: Math.floor(Math.random() * 2000000),
        trade_count: Math.floor(Math.random() * 100),
      });
    }
    
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       REST API Gateway for Stock Market System        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Gateway server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📡 Backend gRPC Services:');
  console.log(`   Market Service:    ${GRPC_SERVICES.MARKET}`);
  console.log(`   Price Service:     ${GRPC_SERVICES.PRICE}`);
  console.log(`   Investor Service:  ${GRPC_SERVICES.INVESTOR}`);
  console.log(`   Analytics Service: ${GRPC_SERVICES.ANALYTICS}`);
  console.log('');
  console.log('⚠️  Running in MOCK MODE - Connect real gRPC services for production');
  console.log('');
  console.log('✅ Health check: http://localhost:' + PORT + '/health');
  console.log('');
});

