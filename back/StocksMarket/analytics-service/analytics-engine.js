import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';

const logger = createServiceLogger('ANALYTICS-ENGINE');

class AnalyticsEngine {
  /**
   * Record a trade for analytics
   */
  async recordTrade(stockSymbol, orderType, quantity, price, investorId, timestamp) {
    try {
      await database.run(
        `INSERT INTO analytics_trades (stock_symbol, order_type, quantity, price, investor_id, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [stockSymbol, orderType, quantity, price, investorId, timestamp]
      );

      logger.debug('Trade recorded', { stockSymbol, orderType, quantity, price });
      
      return { success: true };
    } catch (err) {
      logger.error('Failed to record trade', { error: err.message });
      return { success: false };
    }
  }

  /**
   * Get top traded stocks
   */
  async getTopTradedStocks(limit = 10, timePeriod = 86400000) { // Default 24 hours
    try {
      const cutoffTime = Date.now() - timePeriod;

      const stocks = await database.query(
        `SELECT 
          stock_symbol,
          SUM(quantity) as total_volume,
          COUNT(*) as trade_count,
          SUM(quantity * price) as total_value
         FROM analytics_trades
         WHERE timestamp >= ?
         GROUP BY stock_symbol
         ORDER BY total_volume DESC
         LIMIT ?`,
        [cutoffTime, limit]
      );

      return {
        stocks: stocks.map(s => ({
          stock_symbol: s.stock_symbol,
          total_volume: s.total_volume,
          trade_count: s.trade_count,
          total_value: s.total_value
        }))
      };
    } catch (err) {
      logger.error('Failed to get top traded stocks', { error: err.message });
      throw err;
    }
  }

  /**
   * Get most volatile stocks
   */
  async getMostVolatileStocks(limit = 10, timePeriod = 86400000) {
    try {
      const cutoffTime = Date.now() - timePeriod;

      // Get price history for analysis
      const priceData = await database.query(
        `SELECT 
          stock_symbol,
          MAX(price) as high_price,
          MIN(price) as low_price,
          AVG(price) as avg_price
         FROM price_history
         WHERE timestamp >= ?
         GROUP BY stock_symbol`,
        [cutoffTime]
      );

      const volatileStocks = priceData.map(data => {
        const priceRange = data.high_price - data.low_price;
        const volatilityScore = (priceRange / data.avg_price) * 100;
        const priceChangePercent = ((data.high_price - data.low_price) / data.low_price) * 100;

        return {
          stock_symbol: data.stock_symbol,
          volatility_score: volatilityScore,
          price_change_percent: priceChangePercent,
          high_price: data.high_price,
          low_price: data.low_price
        };
      });

      // Sort by volatility score
      volatileStocks.sort((a, b) => b.volatility_score - a.volatility_score);

      return {
        stocks: volatileStocks.slice(0, limit)
      };
    } catch (err) {
      logger.error('Failed to get volatile stocks', { error: err.message });
      throw err;
    }
  }

  /**
   * Get market statistics
   */
  async getMarketStats() {
    try {
      const today = Date.now() - 86400000; // Last 24 hours

      // Total trades today
      const tradesResult = await database.get(
        'SELECT COUNT(*) as count, SUM(quantity * price) as volume FROM analytics_trades WHERE timestamp >= ?',
        [today]
      );

      // Active investors
      const activeInvestorsResult = await database.get(
        'SELECT COUNT(DISTINCT investor_id) as count FROM analytics_trades WHERE timestamp >= ?',
        [today]
      );

      // Active stocks
      const activeStocksResult = await database.get(
        'SELECT COUNT(DISTINCT stock_symbol) as count FROM analytics_trades WHERE timestamp >= ?',
        [today]
      );

      // Calculate market trend (positive or negative)
      const priceChanges = await database.query(
        `SELECT 
          (current_price - open_price) as change
         FROM stocks`
      );

      let marketTrend = 0;
      if (priceChanges.length > 0) {
        const avgChange = priceChanges.reduce((sum, p) => sum + p.change, 0) / priceChanges.length;
        marketTrend = avgChange;
      }

      // Determine sentiment
      let marketSentiment = 'NEUTRAL';
      if (marketTrend > 0.5) {
        marketSentiment = 'BULLISH';
      } else if (marketTrend < -0.5) {
        marketSentiment = 'BEARISH';
      }

      return {
        total_trades_today: tradesResult.count || 0,
        total_volume_today: tradesResult.volume || 0,
        active_investors: activeInvestorsResult.count || 0,
        active_stocks: activeStocksResult.count || 0,
        market_trend: marketTrend,
        market_sentiment: marketSentiment
      };
    } catch (err) {
      logger.error('Failed to get market stats', { error: err.message });
      throw err;
    }
  }

  /**
   * Get investor performance
   */
  async getInvestorPerformance(investorId) {
    try {
      // Get all transactions
      const transactions = await database.query(
        'SELECT * FROM transactions WHERE investor_id = ?',
        [investorId]
      );

      if (transactions.length === 0) {
        return {
          investor_id: investorId,
          total_profit_loss: 0,
          profit_loss_percent: 0,
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          win_rate: 0,
          average_trade_size: 0,
          risk_level: 'LOW'
        };
      }

      // Calculate profit/loss per stock
      const stockPerformance = {};
      
      transactions.forEach(tx => {
        if (!stockPerformance[tx.stock_symbol]) {
          stockPerformance[tx.stock_symbol] = { buys: [], sells: [] };
        }

        if (tx.type === 'BUY') {
          stockPerformance[tx.stock_symbol].buys.push({
            quantity: tx.quantity,
            price: tx.price
          });
        } else {
          stockPerformance[tx.stock_symbol].sells.push({
            quantity: tx.quantity,
            price: tx.price
          });
        }
      });

      let totalProfitLoss = 0;
      let winningTrades = 0;
      let losingTrades = 0;

      // Calculate P&L for each stock
      for (const symbol in stockPerformance) {
        const { buys, sells } = stockPerformance[symbol];
        
        const totalBuyCost = buys.reduce((sum, b) => sum + (b.quantity * b.price), 0);
        const totalSellRevenue = sells.reduce((sum, s) => sum + (s.quantity * s.price), 0);
        const avgBuyPrice = buys.length > 0 ? totalBuyCost / buys.reduce((sum, b) => sum + b.quantity, 0) : 0;
        const avgSellPrice = sells.length > 0 ? totalSellRevenue / sells.reduce((sum, s) => sum + s.quantity, 0) : 0;

        if (sells.length > 0) {
          const stockPL = totalSellRevenue - totalBuyCost;
          totalProfitLoss += stockPL;

          if (avgSellPrice > avgBuyPrice) {
            winningTrades += sells.length;
          } else {
            losingTrades += sells.length;
          }
        }
      }

      // Get current portfolio value
      const portfolio = await database.query(
        'SELECT stock_symbol, quantity, average_price FROM portfolio WHERE investor_id = ?',
        [investorId]
      );

      // Add unrealized P&L from current holdings
      for (const holding of portfolio) {
        const currentPrice = await database.get(
          'SELECT current_price FROM stocks WHERE symbol = ?',
          [holding.stock_symbol]
        );

        if (currentPrice) {
          const unrealizedPL = (currentPrice.current_price - holding.average_price) * holding.quantity;
          totalProfitLoss += unrealizedPL;
        }
      }

      const totalTrades = winningTrades + losingTrades;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      
      const totalTradeValue = transactions.reduce((sum, tx) => sum + tx.total_amount, 0);
      const averageTradeSize = transactions.length > 0 ? totalTradeValue / transactions.length : 0;

      // Get initial investment
      const investor = await database.get(
        'SELECT balance FROM investors WHERE investor_id = ?',
        [investorId]
      );

      const portfolioValue = portfolio.reduce((sum, h) => {
        return sum + (h.quantity * h.average_price);
      }, 0);

      const totalCapital = (investor?.balance || 0) + portfolioValue;
      const profitLossPercent = totalCapital > 0 ? (totalProfitLoss / totalCapital) * 100 : 0;

      // Determine risk level based on trade frequency and sizes
      let riskLevel = 'LOW';
      if (averageTradeSize > 10000 || transactions.length > 50) {
        riskLevel = 'HIGH';
      } else if (averageTradeSize > 5000 || transactions.length > 20) {
        riskLevel = 'MEDIUM';
      }

      return {
        investor_id: investorId,
        total_profit_loss: totalProfitLoss,
        profit_loss_percent: profitLossPercent,
        total_trades: transactions.length,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        average_trade_size: averageTradeSize,
        risk_level: riskLevel
      };
    } catch (err) {
      logger.error('Failed to get investor performance', { investorId, error: err.message });
      throw err;
    }
  }

  /**
   * Predict price movement (simple linear regression)
   */
  async predictPrice(stockSymbol, timeHorizon = 60) { // Default 60 minutes
    try {
      // Get recent price history
      const recentPrices = await database.query(
        `SELECT price, timestamp FROM price_history 
         WHERE stock_symbol = ? 
         ORDER BY timestamp DESC 
         LIMIT 50`,
        [stockSymbol]
      );

      if (recentPrices.length < 10) {
        return {
          stock_symbol: stockSymbol,
          current_price: 0,
          predicted_price: 0,
          confidence: 0,
          trend: 'STABLE',
          model_used: 'INSUFFICIENT_DATA'
        };
      }

      // Simple moving average prediction
      const currentPrice = recentPrices[0].price;
      const prices = recentPrices.map(p => p.price);
      
      // Calculate trend
      const shortTermAvg = prices.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const longTermAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
      
      // Linear regression
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const n = Math.min(prices.length, 20);

      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += prices[i];
        sumXY += i * prices[i];
        sumXX += i * i;
      }

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Predict future price
      const futureIndex = n + (timeHorizon / 60); // Assume 1 data point per minute
      const predictedPrice = slope * futureIndex + intercept;

      // Calculate confidence (based on R²)
      let ssRes = 0, ssTot = 0;
      const mean = sumY / n;
      
      for (let i = 0; i < n; i++) {
        const predicted = slope * i + intercept;
        ssRes += Math.pow(prices[i] - predicted, 2);
        ssTot += Math.pow(prices[i] - mean, 2);
      }

      const rSquared = 1 - (ssRes / ssTot);
      const confidence = Math.max(0, Math.min(100, rSquared * 100));

      // Determine trend
      let trend = 'STABLE';
      const changePercent = ((predictedPrice - currentPrice) / currentPrice) * 100;
      
      if (changePercent > 0.5) {
        trend = 'UP';
      } else if (changePercent < -0.5) {
        trend = 'DOWN';
      }

      return {
        stock_symbol: stockSymbol,
        current_price: currentPrice,
        predicted_price: predictedPrice,
        confidence: confidence,
        trend: trend,
        model_used: 'LINEAR_REGRESSION'
      };
    } catch (err) {
      logger.error('Failed to predict price', { stockSymbol, error: err.message });
      throw err;
    }
  }

  /**
   * Get trading volume over time
   */
  async getTradingVolume(stockSymbol, startTime, endTime, interval = 60000) { // Default 1 minute
    try {
      const trades = await database.query(
        `SELECT timestamp, quantity, price 
         FROM analytics_trades 
         WHERE stock_symbol = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC`,
        [stockSymbol, startTime, endTime]
      );

      // Group trades into intervals
      const dataPoints = [];
      let currentInterval = Math.floor(startTime / interval) * interval;

      while (currentInterval <= endTime) {
        const intervalEnd = currentInterval + interval;
        
        const intervalTrades = trades.filter(
          t => t.timestamp >= currentInterval && t.timestamp < intervalEnd
        );

        if (intervalTrades.length > 0) {
          const totalVolume = intervalTrades.reduce((sum, t) => sum + t.quantity, 0);
          const avgPrice = intervalTrades.reduce((sum, t) => sum + t.price, 0) / intervalTrades.length;

          dataPoints.push({
            timestamp: currentInterval,
            volume: totalVolume,
            trade_count: intervalTrades.length,
            average_price: avgPrice
          });
        }

        currentInterval += interval;
      }

      return {
        stock_symbol: stockSymbol,
        data_points: dataPoints
      };
    } catch (err) {
      logger.error('Failed to get trading volume', { stockSymbol, error: err.message });
      throw err;
    }
  }
}

export default AnalyticsEngine;

