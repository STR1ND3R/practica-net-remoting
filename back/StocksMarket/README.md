# 🏦 Stock Market API

A production-ready distributed stock market trading system built with gRPC microservices using Node.js.

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Quick Start](#quick-start)
4. [Services](#services)
5. [API Reference](#api-reference)
6. [Configuration](#configuration)
7. [Docker Deployment](#docker-deployment)
8. [Development](#development)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Stock Market API is composed of five interconnected gRPC microservices:

1. **Market Service** (Port 50051) - Trade execution and market operations
2. **Price Service** (Port 50052) - Real-time price management and adjustment
3. **Investor Service** (Port 50053) - Account, balance, and portfolio management
4. **Analytics Service** (Port 50054) - Statistical and predictive analysis
5. **Webhook Service** (Port 8080 HTTP) - External event notifications

### Key Features

- ✅ Real tried-and-tested order matching and execution engine
- ✅ Real-time price updates from live market data
- ✅ Secure investor portfolio and transaction management
- ✅ Advanced market analytics and trend analysis
- ✅ Webhook notifications for external integrations
- ✅ Bidirectional gRPC streaming for real-time updates
- ✅ SQLite database persistence (production-ready)
- ✅ Comprehensive logging and monitoring

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATIONS                         │
│  (Web Dashboards, Trading Apps, Monitoring Tools, Webhooks)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │      WEBHOOK SERVICE (HTTP REST)        │
        │         Port: 8080                      │
        └─────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         gRPC SERVICES                            │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  MARKET SERVICE  │◄────────┤  PRICE SERVICE   │
    │   Port: 50051    │         │   Port: 50052    │
    └────────┬─────────┘         └──────────────────┘
             │
             │
    ┌────────▼─────────┐         ┌──────────────────┐
    │ INVESTOR SERVICE │         │ ANALYTICS SERVICE│
    │   Port: 50053    │         │   Port: 50054    │
    └──────────────────┘         └──────────────────┘
             │                            │
             └──────────┬─────────────────┘
                        ▼
           ┌────────────────────────┐
           │   SQLite DATABASE      │
           │  stockmarket.db        │
           └────────────────────────┘
```

### Technology Stack

- **Node.js 18+**: Runtime environment
- **gRPC**: Inter-service communication
- **Express.js**: HTTP REST API (Webhook Service)
- **SQLite**: Persistent data storage
- **Protocol Buffers**: Message serialization

### Project Structure

```
StocksMarket/
├── protos/                    # Protocol Buffer definitions
│   ├── market.proto
│   ├── price.proto
│   ├── investor.proto
│   └── analytics.proto
│
├── market-service/            # Trading engine
│   ├── server.js
│   └── matching-engine.js
│
├── price-service/             # Price management
│   ├── server.js
│   └── price-manager.js
│
├── investor-service/          # Account management
│   ├── server.js
│   └── portfolio-manager.js
│
├── analytics-service/         # Analytics engine
│   ├── server.js
│   └── analytics-engine.js
│
├── webhook-service/           # Event notifications
│   ├── server.js
│   └── webhook-manager.js
│
├── shared/                    # Common utilities
│   ├── config.js
│   ├── logger.js
│   ├── database.js
│   └── grpc-clients.js
│
├── scripts/                   # Build scripts
├── data/                      # Database (auto-created)
├── logs/                      # Service logs (auto-created)
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Docker (optional)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Start all services
npm run start:all
```

### Alternative: Individual Services

Open separate terminal windows:

```bash
# Terminal 1 - Price Service (start first)
npm run price

# Terminal 2 - Investor Service
npm run investor

# Terminal 3 - Analytics Service
npm run analytics

# Terminal 4 - Market Service
npm run market

# Terminal 5 - Webhook Service
npm run webhook
```

### Verify Installation

```bash
# Check webhook service (HTTP)
curl http://localhost:8080/health

# Expected output:
# {"status":"healthy","service":"webhook-service"}
```

---

## Services

### 1️⃣ Market Service - Trading Engine

**Port:** 50051 (gRPC)

Acts as the central exchange. Receives orders from investors, matches buy and sell requests, executes trades, and coordinates updates with other services.

**Key Responsibilities:**
- Accept buy/sell orders
- Match orders based on price and time priority
- Execute trades and record transactions
- Maintain market state (open, closed, paused)
- Stream real-time order execution events

**Event Types:**
- `ORDER_PLACED` - New order added to book
- `ORDER_EXECUTED` - Trade completed
- `ORDER_CANCELED` - Order removed from book

### 2️⃣ Price Service - Market Quotes Manager

**Port:** 50052 (gRPC)

Receives and distributes live market prices from external data providers.

**Key Responsibilities:**
- Store and serve current market prices
- Provide real-time price streams
- Record historical price data
- Handle price updates from market data feeds

**Event Types:**
- `PRICE_UPDATE` - Stock price changed
- `PRICE_ALERT` - Abnormal volatility detected

### 3️⃣ Investor Service - Account & Portfolio Management

**Port:** 50053 (gRPC)

Handles all investor-related information, ensuring persistence and consistency across sessions.

**Key Responsibilities:**
- Register and authenticate investors
- Manage balances (deposits, withdrawals)
- Maintain investor portfolios (stocks owned and quantities)
- Record transaction history
- Provide reports on holdings and performance

**Event Types:**
- `BALANCE_UPDATED` - Account balance changed
- `NEW_TRANSACTION` - Trade recorded

### 4️⃣ Analytics Service - Market Insights & Predictions

**Port:** 50054 (gRPC)

Aggregates and analyzes historical and live trading data to generate insights about market trends and investor performance.

**Key Responsibilities:**
- Compute top-traded and most-volatile stocks
- Predict price movements using statistical models
- Measure investor profitability and risk
- Generate reports for administrators

**Event Types:**
- `TOP_STOCKS_UPDATED` - Top traders list updated
- `PREDICTION_AVAILABLE` - New price prediction

### 5️⃣ Webhook Service - Event Notification Hub

**Port:** 8080 (HTTP REST)

Provides an HTTP interface for external systems to subscribe to significant simulation events. Enables integrations with dashboards, alerting systems, or custom analytics tools.

**Key Responsibilities:**
- Register, list, and remove webhook subscriptions
- Dispatch events from other gRPC services to subscribed URLs
- Handle retries and delivery confirmation
- Send manual test notifications

---

## API Reference

### Market Service (gRPC - Port 50051)

#### PlaceOrder
Place a buy or sell order.

**Request:**
```protobuf
{
  investor_id: string
  stock_symbol: string
  order_type: OrderType  // 0=BUY, 1=SELL
  quantity: int32
  price: double          // 0 for market order
}
```

**Response:**
```protobuf
{
  order_id: string
  success: bool
  message: string
  status: OrderStatus    // PENDING, FILLED, PARTIALLY_FILLED, CANCELED, REJECTED
}
```

#### CancelOrder
Cancel an existing order.

**Request:**
```protobuf
{
  order_id: string
  investor_id: string
}
```

#### GetOrderStatus
Get the status of an order.

**Request:**
```protobuf
{
  order_id: string
}
```

#### StreamMarketEvents
Stream real-time market events (server streaming).

**Request:**
```protobuf
{
  stock_symbols: string[]  // Empty for all stocks
}
```

#### GetOrderBook
Get order book for a stock.

**Request:**
```protobuf
{
  stock_symbol: string
}
```

**Response:**
```protobuf
{
  stock_symbol: string
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
}
```

#### GetMarketState / SetMarketState
Get or set market state (OPEN, CLOSED, PAUSED).

---

### Price Service (gRPC - Port 50052)

#### GetPrice
Get current price for a stock.

**Request:**
```protobuf
{
  stock_symbol: string
}
```

**Response:**
```protobuf
{
  stock_symbol: string
  current_price: double
  open_price: double
  high_price: double
  low_price: double
  change_percent: double
  last_updated: int64
}
```

#### GetPrices
Get prices for multiple stocks.

**Request:**
```protobuf
{
  stock_symbols: string[]
}
```

#### UpdatePrice
Update price after trade (internal use).

**Request:**
```protobuf
{
  stock_symbol: string
  trade_price: double
  trade_volume: int32
  is_buy: bool
}
```

#### StreamPrices
Stream real-time price updates (server streaming).

**Request:**
```protobuf
{
  stock_symbols: string[]  // Empty for all stocks
}
```

#### GetPriceHistory
Get historical prices.

**Request:**
```protobuf
{
  stock_symbol: string
  start_time: int64
  end_time: int64
  limit: int32
}
```

#### InitializeStock
Initialize stock with starting price.

**Request:**
```protobuf
{
  stock_symbol: string
  initial_price: double
  company_name: string
}
```

---

### Investor Service (gRPC - Port 50053)

#### RegisterInvestor
Register a new investor.

**Request:**
```protobuf
{
  name: string
  email: string
  initial_balance: double
}
```

**Response:**
```protobuf
{
  investor_id: string
  success: bool
  message: string
}
```

#### GetInvestor
Get investor details.

**Request:**
```protobuf
{
  investor_id: string
}
```

#### UpdateBalance
Update investor balance.

**Request:**
```protobuf
{
  investor_id: string
  amount: double         // Positive for deposit, negative for withdrawal
  reason: string
}
```

#### GetPortfolio
Get investor portfolio.

**Request:**
```protobuf
{
  investor_id: string
}
```

**Response:**
```protobuf
{
  investor_id: string
  holdings: PortfolioItem[]
  total_value: double
  total_profit_loss: double
}
```

#### GetTransactionHistory
Get transaction history.

**Request:**
```protobuf
{
  investor_id: string
  limit: int32
  start_time: int64
  end_time: int64
}
```

#### ValidateOrder
Validate if investor can place an order.

**Request:**
```protobuf
{
  investor_id: string
  stock_symbol: string
  order_type: string     // BUY or SELL
  quantity: int32
  price: double
}
```

---

### Analytics Service (gRPC - Port 50054)

#### GetTopTradedStocks
Get top traded stocks.

**Request:**
```protobuf
{
  limit: int32
  time_period: int64     // milliseconds
}
```

#### GetMostVolatileStocks
Get most volatile stocks.

**Request:**
```protobuf
{
  limit: int32
  time_period: int64
}
```

#### GetMarketStats
Get overall market statistics.

**Response:**
```protobuf
{
  total_trades_today: int32
  total_volume_today: double
  active_investors: int32
  active_stocks: int32
  market_trend: double
  market_sentiment: string  // BULLISH, BEARISH, NEUTRAL
}
```

#### GetInvestorPerformance
Get investor performance metrics.

**Request:**
```protobuf
{
  investor_id: string
}
```

**Response:**
```protobuf
{
  investor_id: string
  total_profit_loss: double
  profit_loss_percent: double
  total_trades: int32
  winning_trades: int32
  losing_trades: int32
  win_rate: double
  average_trade_size: double
  risk_level: string     // LOW, MEDIUM, HIGH
}
```

#### PredictPrice
Predict future price movement.

**Request:**
```protobuf
{
  stock_symbol: string
  time_horizon: int32    // minutes
}
```

#### RecordTrade
Record trade for analytics (internal use).

#### GetTradingVolume
Get trading volume over time.

**Request:**
```protobuf
{
  stock_symbol: string
  start_time: int64
  end_time: int64
  interval: int32        // seconds
}
```

---

### Webhook Service (HTTP REST - Port 8080)

#### Register Webhook

**POST** `/webhooks`

```bash
curl -X POST http://localhost:8080/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-webhook-url.com/endpoint",
    "events": ["ORDER_EXECUTED", "PRICE_UPDATE"]
  }'
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": 1,
    "url": "https://your-webhook-url.com/endpoint",
    "events": ["ORDER_EXECUTED", "PRICE_UPDATE"],
    "active": true,
    "created_at": 1234567890
  }
}
```

#### List Webhooks

**GET** `/webhooks`

```bash
curl http://localhost:8080/webhooks
```

#### Get Webhook

**GET** `/webhooks/:id`

```bash
curl http://localhost:8080/webhooks/1
```

#### Delete Webhook

**DELETE** `/webhooks/:id`

```bash
curl -X DELETE http://localhost:8080/webhooks/1
```

#### Update Webhook Status

**PATCH** `/webhooks/:id`

```bash
curl -X PATCH http://localhost:8080/webhooks/1 \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

#### Send Test Notification

**POST** `/webhooks/test`

```bash
curl -X POST http://localhost:8080/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{"url": "https://webhook.site/unique-id"}'
```

#### Available Event Types

**GET** `/events/types`

```bash
curl http://localhost:8080/events/types
```

**Available Events:**
- `ORDER_PLACED`
- `ORDER_EXECUTED`
- `ORDER_CANCELED`
- `PRICE_UPDATE`
- `PRICE_ALERT`
- `BALANCE_UPDATED`
- `NEW_TRANSACTION`
- `TOP_STOCKS_UPDATED`
- `PREDICTION_AVAILABLE`

#### Health Check

**GET** `/health`

```bash
curl http://localhost:8080/health
```

---

## Configuration

### Environment Variables

Create or edit `.env` file in the root directory:

```env
# Service Ports
MARKET_SERVICE_PORT=50051
PRICE_SERVICE_PORT=50052
INVESTOR_SERVICE_PORT=50053
ANALYTICS_SERVICE_PORT=50054
WEBHOOK_SERVICE_PORT=8080

# Service Hosts
MARKET_SERVICE_HOST=localhost
PRICE_SERVICE_HOST=localhost
INVESTOR_SERVICE_HOST=localhost
ANALYTICS_SERVICE_HOST=localhost

# Database
DATABASE_PATH=./data/stockmarket.db

# Logging
LOG_LEVEL=info

# Market Configuration
INITIAL_STOCKS=AAPL:150.0:Apple Inc.,GOOGL:2800.0:Alphabet Inc.,MSFT:330.0:Microsoft Corp.,TSLA:250.0:Tesla Inc.,AMZN:3300.0:Amazon.com Inc.
PRICE_VOLATILITY_FACTOR=0.001
MARKET_OPEN_HOUR=9
MARKET_CLOSE_HOUR=16
```

### Initial Stocks Configuration

Edit `INITIAL_STOCKS` to configure starting stocks:

```env
INITIAL_STOCKS=SYMBOL:PRICE:NAME,SYMBOL:PRICE:NAME,...
```

Example:
```env
INITIAL_STOCKS=AAPL:150.0:Apple Inc.,GOOGL:2800.0:Alphabet Inc.
```

### Database Structure

The system automatically creates these tables:

- **stocks** - Stock information and current prices
- **price_history** - Historical price data
- **investors** - Investor accounts
- **portfolio** - Investor holdings
- **transactions** - Trade history
- **orders** - Active and historical orders
- **webhooks** - Registered webhooks
- **analytics_trades** - Analytics data

---

## Docker Deployment

### Using Docker Compose

```bash
# Build and start all services
docker-compose up

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Docker Configuration

The `docker-compose.yml` file defines all five services with proper networking and volume mounting.

**Exposed Ports:**
- Market Service: 50051
- Price Service: 50052
- Investor Service: 50053
- Analytics Service: 50054
- Webhook Service: 8080

**Volumes:**
- `./data` - Database persistence
- `./logs` - Service logs

---

## Development

### Available npm Scripts

```bash
npm run market      # Start Market Service
npm run price       # Start Price Service
npm run investor    # Start Investor Service
npm run analytics   # Start Analytics Service
npm run webhook     # Start Webhook Service
npm run start:all   # Start all services concurrently
npm run proto       # Generate proto files (info only)
```

### Service Startup Order

For proper initialization, start services in this order:

1. **Price Service** (50052) - No dependencies
2. **Investor Service** (50053) - Depends on Price Service
3. **Analytics Service** (50054) - No dependencies
4. **Market Service** (50051) - Depends on Price, Investor, Analytics
5. **Webhook Service** (8080) - No dependencies

### Viewing Logs

```bash
# All logs
tail -f logs/*.log

# Specific service
tail -f logs/market-service.log
```

### Database Access

```bash
# Install sqlite3 if needed
npm install -g sqlite3

# Open database
sqlite3 data/stockmarket.db

# Example queries
SELECT * FROM stocks;
SELECT * FROM investors;
SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10;
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process using port
lsof -ti:50051 | xargs kill -9

# Or kill all node processes
killall node

# Then restart services
npm run start:all
```

### Database Locked

```bash
# Stop all services
killall node

# Delete database and restart
rm -rf data/
npm run start:all
```

### gRPC Connection Errors

Make sure services start in the correct order:

1. Price Service first
2. Then Investor and Analytics
3. Finally Market Service

Wait 2-3 seconds between starting services.

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Docker Issues

```bash
# Reset Docker environment
docker-compose down -v
docker-compose up --build
```

### Service Not Responding

Check logs for errors:

```bash
tail -f logs/[service-name].log
```

Verify service is running:

```bash
# For webhook service (HTTP)
curl http://localhost:8080/health

# For gRPC services, check process
ps aux | grep node
```

---

## Trade Execution Flow

```
1. Client → Market Service: PlaceOrder()
2. Market Service → Investor Service: ValidateOrder()
3. Market Service: Match orders in order book
4. Market Service → Price Service: UpdatePrice()
5. Market Service → Investor Service: UpdatePortfolio()
6. Market Service → Investor Service: UpdateBalance()
7. Market Service → Analytics Service: RecordTrade()
8. Market Service → Webhook Service: Dispatch event
9. Webhook Service → External URLs: POST webhook notification
```

---

## Dependencies

### Production Dependencies

- `@grpc/grpc-js` (^1.9.14) - gRPC implementation
- `@grpc/proto-loader` (^0.7.10) - Dynamic proto loading
- `express` (^4.18.2) - HTTP server
- `axios` (^1.6.2) - HTTP client
- `sqlite3` (^5.1.6) - Database driver
- `dotenv` (^16.3.1) - Environment configuration
- `uuid` (^9.0.1) - UUID generation
- `winston` (^3.11.0) - Logging

### Development Dependencies

- `concurrently` (^8.2.2) - Run multiple commands
- `nodemon` (^3.0.2) - Auto-restart on changes
- `jest` (^29.7.0) - Testing framework

---

## License

MIT License

---

## Support

For issues or questions:

1. Check the logs in `./logs/`
2. Review this documentation
3. Verify all dependencies are installed
4. Ensure correct service startup order
5. Check that all required ports are available

---

**Built with Node.js and gRPC - Production-Ready Stock Trading API** 🚀
