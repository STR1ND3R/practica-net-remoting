# Stock Market (gRPC microservices + React)

Distributed stock market simulation built with Node.js gRPC microservices (market, price, investor, analytics, webhook), a REST API gateway, and a React frontend. Runs locally with npm or via Docker.

## Project Structure

- `back/StocksMarket`: Backend microservices (gRPC), SQLite DB, logs, proto files
  - `market-service/`, `price-service/`, `investor-service/`, `analytics-service/`, `webhook-service/`
  - `shared/`: config, database, logger, gRPC client helpers
  - `protos/`: `.proto` contracts
  - `data/stockmarket.db`: SQLite database
  - `logs/`: service logs
  - `docker-compose.yml`, `Dockerfile`
- `front`: React app (Vite) and REST API gateway
  - `gateway/`: Express REST gateway bridging to gRPC (or mock mode)

## Prerequisites

- Node.js ≥ 18 and npm
- Optional: Docker and Docker Compose

## Quick Start

1) Install dependencies

```bash
# Backend
cd "back/StocksMarket" && npm install

# Frontend + Gateway (from repo root)
cd "front" && npm install && cd gateway && npm install
```

2) Run everything in dev mode

```bash
# Terminal A – start backend services
cd "back/StocksMarket" && npm run start:all

# Terminal B – start frontend and gateway together
cd "front" && npm run start
```

- Frontend: http://localhost:5173
- Gateway (REST): http://localhost:3001 (health: `/health`)

The gateway starts in MOCK MODE by default (no gRPC connection required). The UI will work with simulated data. See “Connect to real gRPC services” below to use live backend calls.

## Backend (gRPC services)

Scripts (run from `back/StocksMarket`):

```bash
# Start individual services
npm run market
npm run price
npm run investor
npm run analytics
npm run webhook

# Start all services in parallel
npm run start:all

# Example utility
npm run test:price-updates
```

Environment (optional – `.env` in `back/StocksMarket`):

```env
MARKET_SERVICE_HOST=localhost
MARKET_SERVICE_PORT=50051
PRICE_SERVICE_HOST=localhost
PRICE_SERVICE_PORT=50052
INVESTOR_SERVICE_HOST=localhost
INVESTOR_SERVICE_PORT=50053
ANALYTICS_SERVICE_HOST=localhost
ANALYTICS_SERVICE_PORT=50054
WEBHOOK_SERVICE_PORT=8080
DATABASE_PATH=./data/stockmarket.db
LOG_LEVEL=info
INITIAL_STOCKS=AAPL:150.0:Apple Inc.,GOOGL:2800.0:Alphabet Inc.,MSFT:330.0:Microsoft Corp.
PRICE_VOLATILITY_FACTOR=0.001
MARKET_OPEN_HOUR=9
MARKET_CLOSE_HOUR=16
```

Logs and data:

- Database: `back/StocksMarket/data/stockmarket.db`
- Logs: `back/StocksMarket/logs/*.log`

### Docker (optional)

```bash
cd "back/StocksMarket"
docker compose up --build
```

Exposed ports:

- Market `50051`, Price `50052`, Investor `50053`, Analytics `50054`, Webhook `8080`
- Data/logs are mounted from `./data` and `./logs`

## Frontend + REST API Gateway

From `front`:

```bash
# Start gateway (dev) and Vite together
npm run start

# Or run separately
npm run gateway:dev    # in /front
npm run dev            # in /front (Vite)
```

Gateway environment (optional – set when you want real gRPC calls):

```env
# Gateway server port
GATEWAY_PORT=3001

# Point to actual gRPC services
MARKET_SERVICE_HOST=localhost:50051
PRICE_SERVICE_HOST=localhost:50052
INVESTOR_SERVICE_HOST=localhost:50053
ANALYTICS_SERVICE_HOST=localhost:50054

# Path to backend proto files
# IMPORTANT: adjust to this repo structure
PROTO_PATH=/Users/your-user/path/to/practica-net-remoting/back/StocksMarket/protos
```

### Connect to real gRPC services

By default, the gateway runs in mock mode. To enable real backend calls:

1. Ensure backend services are running (`back/StocksMarket`, `npm run start:all`).
2. Set `MARKET_SERVICE_HOST`, `PRICE_SERVICE_HOST`, `INVESTOR_SERVICE_HOST`, `ANALYTICS_SERVICE_HOST` to the correct `host:port` values.
3. Set `PROTO_PATH` so the gateway can load `market.proto`, `price.proto`, `investor.proto`, `analytics.proto`. In this repo it should point to `back/StocksMarket/protos`.
4. In `front/gateway/server.js`, uncomment the gRPC client initialization block if you want to disable mock mode entirely.

Restart the gateway after changing environment variables.

## Scripts Reference

Backend (`back/StocksMarket/package.json`):

```json
{
  "scripts": {
    "market": "node market-service/server.js",
    "price": "node price-service/server.js",
    "investor": "node investor-service/server.js",
    "analytics": "node analytics-service/server.js",
    "webhook": "node webhook-service/server.js",
    "start:all": "concurrently \"npm run price\" \"npm run investor\" \"npm run analytics\" \"npm run market\" \"npm run webhook\"",
    "test:price-updates": "node examples/test-price-updates.js"
  }
}
```

Frontend (`front/package.json`):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "gateway": "cd gateway && npm start",
    "gateway:dev": "cd gateway && npm run dev",
    "start": "concurrently \"npm run gateway:dev\" \"npm run dev\" --names \"GATEWAY,VITE\" --prefix-colors \"blue,green\""
  }
}
```

## Troubleshooting

- Gateway prints “Running in MOCK MODE” and no backend data: set `PROTO_PATH` and service host/ports, ensure backend is running, and restart the gateway.
- Port conflicts: change ports via env vars (`GATEWAY_PORT`, `*_SERVICE_PORT`).
- SQLite file permissions: ensure `back/StocksMarket/data` is writable.
- Proto loading errors: verify `PROTO_PATH` points to `back/StocksMarket/protos`.

## License

MIT
