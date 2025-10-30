import axios from 'axios';

// Base API URL - adjust based on your backend setup
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || 'http://localhost:8080';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const webhookApi = axios.create({
  baseURL: WEBHOOK_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Market Service API
export const marketService = {
  // Place a buy or sell order
  placeOrder: async (orderData) => {
    const response = await api.post('/api/market/orders', orderData);
    return response.data;
  },

  // Cancel an order
  cancelOrder: async (orderId, investorId) => {
    const response = await api.delete(`/api/market/orders/${orderId}`, {
      data: { investorId },
    });
    return response.data;
  },

  // Get order status
  getOrderStatus: async (orderId) => {
    const response = await api.get(`/api/market/orders/${orderId}`);
    return response.data;
  },

  // Get order book for a stock
  getOrderBook: async (stockSymbol) => {
    const response = await api.get(`/api/market/orderbook/${stockSymbol}`);
    return response.data;
  },

  // Get market state
  getMarketState: async () => {
    const response = await api.get('/api/market/state');
    return response.data;
  },

  // Set market state (admin only)
  setMarketState: async (state) => {
    const response = await api.put('/api/market/state', { state });
    return response.data;
  },
};

// Price Service API
export const priceService = {
  // Get current price for a stock
  getPrice: async (stockSymbol) => {
    const response = await api.get(`/api/prices/${stockSymbol}`);
    return response.data;
  },

  // Get prices for multiple stocks
  getPrices: async (stockSymbols) => {
    const response = await api.post('/api/prices/batch', { stockSymbols });
    return response.data;
  },

  // Get all available stocks
  getAllStocks: async () => {
    const response = await api.get('/api/prices/all');
    return response.data;
  },

  // Get price history
  getPriceHistory: async (stockSymbol, startTime, endTime, limit = 100) => {
    const response = await api.get(`/api/prices/${stockSymbol}/history`, {
      params: { startTime, endTime, limit },
    });
    return response.data;
  },

  // Initialize a new stock (admin only)
  initializeStock: async (stockData) => {
    const response = await api.post('/api/prices/initialize', stockData);
    return response.data;
  },
};

// Investor Service API
export const investorService = {
  // Register a new investor
  registerInvestor: async (investorData) => {
    const response = await api.post('/api/investors', investorData);
    return response.data;
  },

  // Get investor details
  getInvestor: async (investorId) => {
    const response = await api.get(`/api/investors/${investorId}`);
    return response.data;
  },

  // Update investor balance
  updateBalance: async (investorId, amount, reason) => {
    const response = await api.patch(`/api/investors/${investorId}/balance`, {
      amount,
      reason,
    });
    return response.data;
  },

  // Get investor portfolio
  getPortfolio: async (investorId) => {
    const response = await api.get(`/api/investors/${investorId}/portfolio`);
    return response.data;
  },

  // Get transaction history
  getTransactionHistory: async (investorId, limit = 50, startTime, endTime) => {
    const response = await api.get(`/api/investors/${investorId}/transactions`, {
      params: { limit, startTime, endTime },
    });
    return response.data;
  },

  // Validate if an order can be placed
  validateOrder: async (orderData) => {
    const response = await api.post('/api/investors/validate-order', orderData);
    return response.data;
  },

  // Get all investors (admin only)
  getAllInvestors: async () => {
    const response = await api.get('/api/investors');
    return response.data;
  },
};

// Analytics Service API
export const analyticsService = {
  // Get top traded stocks
  getTopTradedStocks: async (limit = 10, timePeriod) => {
    const response = await api.get('/api/analytics/top-traded', {
      params: { limit, timePeriod },
    });
    return response.data;
  },

  // Get most volatile stocks
  getMostVolatileStocks: async (limit = 10, timePeriod) => {
    const response = await api.get('/api/analytics/volatile', {
      params: { limit, timePeriod },
    });
    return response.data;
  },

  // Get market statistics
  getMarketStats: async () => {
    const response = await api.get('/api/analytics/market-stats');
    return response.data;
  },

  // Get investor performance
  getInvestorPerformance: async (investorId) => {
    const response = await api.get(`/api/analytics/investor/${investorId}/performance`);
    return response.data;
  },

  // Predict price movement
  predictPrice: async (stockSymbol, timeHorizon = 60) => {
    const response = await api.post('/api/analytics/predict', {
      stockSymbol,
      timeHorizon,
    });
    return response.data;
  },

  // Get trading volume
  getTradingVolume: async (stockSymbol, startTime, endTime, interval = 3600) => {
    const response = await api.get(`/api/analytics/volume/${stockSymbol}`, {
      params: { startTime, endTime, interval },
    });
    return response.data;
  },
};

// Webhook Service API
export const webhookService = {
  // Register a webhook
  registerWebhook: async (url, events) => {
    const response = await webhookApi.post('/webhooks', { url, events });
    return response.data;
  },

  // List all webhooks
  listWebhooks: async () => {
    const response = await webhookApi.get('/webhooks');
    return response.data;
  },

  // Get a specific webhook
  getWebhook: async (webhookId) => {
    const response = await webhookApi.get(`/webhooks/${webhookId}`);
    return response.data;
  },

  // Delete a webhook
  deleteWebhook: async (webhookId) => {
    const response = await webhookApi.delete(`/webhooks/${webhookId}`);
    return response.data;
  },

  // Update webhook status
  updateWebhookStatus: async (webhookId, active) => {
    const response = await webhookApi.patch(`/webhooks/${webhookId}`, { active });
    return response.data;
  },

  // Send test notification
  sendTestNotification: async (url) => {
    const response = await webhookApi.post('/webhooks/test', { url });
    return response.data;
  },

  // Get available event types
  getEventTypes: async () => {
    const response = await webhookApi.get('/events/types');
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await webhookApi.get('/health');
    return response.data;
  },
};

// Error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error
      console.error('API Error:', error.response.data);
      throw new Error(error.response.data.message || 'An error occurred');
    } else if (error.request) {
      // Request made but no response
      console.error('Network Error:', error.request);
      throw new Error('Network error. Please check your connection.');
    } else {
      console.error('Error:', error.message);
      throw error;
    }
  }
);

// Export default api instance
export default api;

