import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';
import { config } from '../shared/config.js';

const logger = createServiceLogger('PRICE-MANAGER');

class PriceManager {
  constructor() {
    this.priceSubscribers = new Set();
    this.volatilityFactor = config.market.priceVolatilityFactor;
  }

  /**
   * Initialize stocks with starting prices
   */
  async initializeStocks() {
    const stocksConfig = config.market.initialStocks.split(',');
    
    for (const stockConfig of stocksConfig) {
      const [symbol, price, companyName] = stockConfig.split(':');
      
      const existing = await database.get(
        'SELECT symbol FROM stocks WHERE symbol = ?',
        [symbol.trim()]
      );

      if (!existing) {
        await this.initializeStock(
          symbol.trim(),
          parseFloat(price),
          companyName.trim()
        );
      }
    }
  }

  /**
   * Initialize a single stock
   */
  async initializeStock(stockSymbol, initialPrice, companyName) {
    try {
      const now = Date.now();
      
      await database.run(
        `INSERT OR REPLACE INTO stocks 
         (symbol, company_name, current_price, open_price, high_price, low_price, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stockSymbol, companyName, initialPrice, initialPrice, initialPrice, initialPrice, now]
      );

      // Record initial price in history
      await database.run(
        'INSERT INTO price_history (stock_symbol, price, volume, timestamp) VALUES (?, ?, ?, ?)',
        [stockSymbol, initialPrice, 0, now]
      );

      logger.info('Stock initialized', { symbol: stockSymbol, price: initialPrice, company: companyName });
      
      return { success: true, message: 'Stock initialized successfully' };
    } catch (err) {
      logger.error('Failed to initialize stock', { error: err.message });
      return { success: false, message: err.message };
    }
  }

  /**
   * Get current price for a stock
   */
  async getPrice(stockSymbol) {
    try {
      const stock = await database.get(
        'SELECT * FROM stocks WHERE symbol = ?',
        [stockSymbol]
      );

      if (!stock) {
        throw new Error(`Stock ${stockSymbol} not found`);
      }

      const changePercent = ((stock.current_price - stock.open_price) / stock.open_price) * 100;

      return {
        stock_symbol: stock.symbol,
        current_price: stock.current_price,
        open_price: stock.open_price,
        high_price: stock.high_price,
        low_price: stock.low_price,
        change_percent: changePercent,
        last_updated: stock.last_updated
      };
    } catch (err) {
      logger.error('Failed to get price', { symbol: stockSymbol, error: err.message });
      throw err;
    }
  }

  /**
   * Get prices for multiple stocks
   */
  async getPrices(stockSymbols) {
    const prices = [];

    for (const symbol of stockSymbols) {
      try {
        const price = await this.getPrice(symbol);
        prices.push(price);
      } catch (err) {
        logger.warn('Failed to get price for stock', { symbol, error: err.message });
      }
    }

    return prices;
  }

  /**
   * Update price after a trade
   */
  async updatePrice(stockSymbol, tradePrice, tradeVolume, isBuy) {
    try {
      const stock = await database.get(
        'SELECT * FROM stocks WHERE symbol = ?',
        [stockSymbol]
      );

      if (!stock) {
        throw new Error(`Stock ${stockSymbol} not found`);
      }

      const currentPrice = stock.current_price;
      
      // Calculate price change based on trade
      // Buy orders push price up, sell orders push price down
      const direction = isBuy ? 1 : -1;
      const volumeImpact = Math.log(1 + tradeVolume / 100); // Logarithmic impact
      const priceChange = currentPrice * this.volatilityFactor * direction * volumeImpact;
      
      // Add some randomness (±0.1% of price change)
      const randomFactor = 1 + (Math.random() - 0.5) * 0.002;
      const newPrice = Math.max(0.01, currentPrice + (priceChange * randomFactor));

      // Update high/low prices
      const highPrice = Math.max(stock.high_price, newPrice);
      const lowPrice = Math.min(stock.low_price, newPrice);

      const now = Date.now();

      // Update stock price
      await database.run(
        `UPDATE stocks 
         SET current_price = ?, high_price = ?, low_price = ?, last_updated = ?
         WHERE symbol = ?`,
        [newPrice, highPrice, lowPrice, now, stockSymbol]
      );

      // Record price in history
      await database.run(
        'INSERT INTO price_history (stock_symbol, price, volume, timestamp) VALUES (?, ?, ?, ?)',
        [stockSymbol, newPrice, tradeVolume, now]
      );

      const priceChangeDelta = newPrice - currentPrice;
      const changePercent = (priceChangeDelta / currentPrice) * 100;

      logger.info('Price updated', {
        symbol: stockSymbol,
        oldPrice: currentPrice,
        newPrice,
        change: priceChangeDelta.toFixed(2),
        changePercent: changePercent.toFixed(2)
      });

      // Notify subscribers
      this.notifyPriceUpdate({
        stock_symbol: stockSymbol,
        price: newPrice,
        change_percent: changePercent,
        timestamp: now,
        trigger: 'TRADE'
      });

      return {
        success: true,
        new_price: newPrice,
        price_change: priceChangeDelta
      };
    } catch (err) {
      logger.error('Failed to update price', { symbol: stockSymbol, error: err.message });
      throw err;
    }
  }

  /**
   * Get price history
   */
  async getPriceHistory(stockSymbol, startTime, endTime, limit) {
    try {
      let query = 'SELECT price, timestamp, volume FROM price_history WHERE stock_symbol = ?';
      const params = [stockSymbol];

      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime);
      }

      if (endTime) {
        query += ' AND timestamp <= ?';
        params.push(endTime);
      }

      query += ' ORDER BY timestamp DESC';

      if (limit && limit > 0) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      const history = await database.query(query, params);

      return {
        stock_symbol: stockSymbol,
        history: history.map(h => ({
          price: h.price,
          timestamp: h.timestamp,
          volume: h.volume
        }))
      };
    } catch (err) {
      logger.error('Failed to get price history', { symbol: stockSymbol, error: err.message });
      throw err;
    }
  }

  /**
   * Subscribe to price updates
   */
  subscribe(callback) {
    this.priceSubscribers.add(callback);
    logger.info('New price subscriber added');
    return () => {
      this.priceSubscribers.delete(callback);
      logger.info('Price subscriber removed');
    };
  }

  /**
   * Notify price update to subscribers
   */
  notifyPriceUpdate(priceUpdate) {
    this.priceSubscribers.forEach(callback => {
      try {
        callback(priceUpdate);
      } catch (err) {
        logger.error('Error notifying price subscriber', { error: err.message });
      }
    });
  }

  /**
   * Reset daily prices (call at market open)
   */
  async resetDailyPrices() {
    try {
      await database.run(
        `UPDATE stocks 
         SET open_price = current_price, high_price = current_price, low_price = current_price`
      );
      logger.info('Daily prices reset');
    } catch (err) {
      logger.error('Failed to reset daily prices', { error: err.message });
    }
  }
}

export default PriceManager;

