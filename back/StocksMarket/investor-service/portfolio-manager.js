import { v4 as uuidv4 } from 'uuid';
import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';

const logger = createServiceLogger('PORTFOLIO-MANAGER');

class PortfolioManager {
  /**
   * Register a new investor
   */
  async registerInvestor(name, email, initialBalance) {
    try {
      const investorId = uuidv4();
      const createdAt = Date.now();

      await database.run(
        'INSERT INTO investors (investor_id, name, email, balance, created_at) VALUES (?, ?, ?, ?, ?)',
        [investorId, name, email, initialBalance, createdAt]
      );

      logger.info('Investor registered', { investorId, name, email });

      return {
        investor_id: investorId,
        success: true,
        message: 'Investor registered successfully'
      };
    } catch (err) {
      logger.error('Failed to register investor', { error: err.message });
      
      if (err.message.includes('UNIQUE constraint failed')) {
        return {
          investor_id: '',
          success: false,
          message: 'Email already registered'
        };
      }

      return {
        investor_id: '',
        success: false,
        message: err.message
      };
    }
  }

  /**
   * Get investor details
   */
  async getInvestor(investorId) {
    try {
      const investor = await database.get(
        'SELECT * FROM investors WHERE investor_id = ?',
        [investorId]
      );

      if (!investor) {
        throw new Error('Investor not found');
      }

      return {
        investor_id: investor.investor_id,
        name: investor.name,
        email: investor.email,
        balance: investor.balance,
        created_at: investor.created_at
      };
    } catch (err) {
      logger.error('Failed to get investor', { investorId, error: err.message });
      throw err;
    }
  }

  /**
   * Update investor balance
   */
  async updateBalance(investorId, amount, reason) {
    try {
      const investor = await this.getInvestor(investorId);
      const newBalance = investor.balance + amount;

      if (newBalance < 0) {
        return {
          success: false,
          new_balance: investor.balance,
          message: 'Insufficient balance'
        };
      }

      await database.run(
        'UPDATE investors SET balance = ? WHERE investor_id = ?',
        [newBalance, investorId]
      );

      logger.info('Balance updated', {
        investorId,
        oldBalance: investor.balance,
        newBalance,
        amount,
        reason
      });

      return {
        success: true,
        new_balance: newBalance,
        message: 'Balance updated successfully'
      };
    } catch (err) {
      logger.error('Failed to update balance', { investorId, error: err.message });
      return {
        success: false,
        new_balance: 0,
        message: err.message
      };
    }
  }

  /**
   * Get investor portfolio
   */
  async getPortfolio(investorId, currentPrices = {}) {
    try {
      const holdings = await database.query(
        'SELECT * FROM portfolio WHERE investor_id = ?',
        [investorId]
      );

      let totalValue = 0;
      let totalProfitLoss = 0;

      const portfolioItems = holdings.map(holding => {
        const currentPrice = currentPrices[holding.stock_symbol] || holding.average_price;
        const currentValue = holding.quantity * currentPrice;
        const costBasis = holding.quantity * holding.average_price;
        const profitLoss = currentValue - costBasis;

        totalValue += currentValue;
        totalProfitLoss += profitLoss;

        return {
          stock_symbol: holding.stock_symbol,
          quantity: holding.quantity,
          average_price: holding.average_price,
          current_value: currentValue,
          profit_loss: profitLoss
        };
      });

      return {
        investor_id: investorId,
        holdings: portfolioItems,
        total_value: totalValue,
        total_profit_loss: totalProfitLoss
      };
    } catch (err) {
      logger.error('Failed to get portfolio', { investorId, error: err.message });
      throw err;
    }
  }

  /**
   * Update portfolio after trade
   */
  async updatePortfolio(investorId, stockSymbol, quantityChange, price, transactionId) {
    try {
      const existing = await database.get(
        'SELECT * FROM portfolio WHERE investor_id = ? AND stock_symbol = ?',
        [investorId, stockSymbol]
      );

      if (quantityChange > 0) {
        // Buy: Add to portfolio
        if (existing) {
          const newQuantity = existing.quantity + quantityChange;
          const newAveragePrice = 
            ((existing.quantity * existing.average_price) + (quantityChange * price)) / newQuantity;

          await database.run(
            'UPDATE portfolio SET quantity = ?, average_price = ? WHERE investor_id = ? AND stock_symbol = ?',
            [newQuantity, newAveragePrice, investorId, stockSymbol]
          );
        } else {
          await database.run(
            'INSERT INTO portfolio (investor_id, stock_symbol, quantity, average_price) VALUES (?, ?, ?, ?)',
            [investorId, stockSymbol, quantityChange, price]
          );
        }
      } else {
        // Sell: Remove from portfolio
        if (!existing) {
          return {
            success: false,
            message: 'Stock not in portfolio'
          };
        }

        const newQuantity = existing.quantity + quantityChange; // quantityChange is negative

        if (newQuantity < 0) {
          return {
            success: false,
            message: 'Insufficient shares'
          };
        }

        if (newQuantity === 0) {
          await database.run(
            'DELETE FROM portfolio WHERE investor_id = ? AND stock_symbol = ?',
            [investorId, stockSymbol]
          );
        } else {
          await database.run(
            'UPDATE portfolio SET quantity = ? WHERE investor_id = ? AND stock_symbol = ?',
            [newQuantity, investorId, stockSymbol]
          );
        }
      }

      // Record transaction
      const transactionType = quantityChange > 0 ? 'BUY' : 'SELL';
      const absQuantity = Math.abs(quantityChange);
      const totalAmount = absQuantity * price;
      const timestamp = Date.now();

      await database.run(
        `INSERT INTO transactions (transaction_id, investor_id, stock_symbol, type, quantity, price, total_amount, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, investorId, stockSymbol, transactionType, absQuantity, price, totalAmount, timestamp]
      );

      logger.info('Portfolio updated', {
        investorId,
        stockSymbol,
        quantityChange,
        price,
        transactionId
      });

      return {
        success: true,
        message: 'Portfolio updated successfully'
      };
    } catch (err) {
      logger.error('Failed to update portfolio', { investorId, error: err.message });
      return {
        success: false,
        message: err.message
      };
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(investorId, limit, startTime, endTime) {
    try {
      let query = 'SELECT * FROM transactions WHERE investor_id = ?';
      const params = [investorId];

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

      const transactions = await database.query(query, params);

      return {
        transactions: transactions.map(tx => ({
          transaction_id: tx.transaction_id,
          stock_symbol: tx.stock_symbol,
          type: tx.type,
          quantity: tx.quantity,
          price: tx.price,
          total_amount: tx.total_amount,
          timestamp: tx.timestamp
        }))
      };
    } catch (err) {
      logger.error('Failed to get transaction history', { investorId, error: err.message });
      throw err;
    }
  }

  /**
   * Validate if investor can place an order
   */
  async validateOrder(investorId, stockSymbol, orderType, quantity, price) {
    try {
      const investor = await this.getInvestor(investorId);

      if (orderType === 'BUY') {
        const requiredBalance = quantity * price;
        
        if (investor.balance < requiredBalance) {
          return {
            valid: false,
            message: 'Insufficient balance',
            required_balance: requiredBalance,
            available_shares: 0
          };
        }

        return {
          valid: true,
          message: 'Order valid',
          required_balance: requiredBalance,
          available_shares: 0
        };
      } else {
        // SELL
        const holding = await database.get(
          'SELECT quantity FROM portfolio WHERE investor_id = ? AND stock_symbol = ?',
          [investorId, stockSymbol]
        );

        const availableShares = holding ? holding.quantity : 0;

        if (availableShares < quantity) {
          return {
            valid: false,
            message: 'Insufficient shares',
            required_balance: 0,
            available_shares: availableShares
          };
        }

        return {
          valid: true,
          message: 'Order valid',
          required_balance: 0,
          available_shares: availableShares
        };
      }
    } catch (err) {
      logger.error('Failed to validate order', { investorId, error: err.message });
      return {
        valid: false,
        message: err.message,
        required_balance: 0,
        available_shares: 0
      };
    }
  }
}

export default PortfolioManager;

