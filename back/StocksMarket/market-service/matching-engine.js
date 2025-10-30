import { v4 as uuidv4 } from 'uuid';
import { createServiceLogger } from '../shared/logger.js';

const logger = createServiceLogger('MATCHING-ENGINE');

class MatchingEngine {
  constructor() {
    // Order books: { stockSymbol: { bids: [], asks: [] } }
    this.orderBooks = {};
    
    // Active orders: { orderId: order }
    this.orders = {};
    
    // Event subscribers
    this.eventSubscribers = new Set();
  }

  /**
   * Add an order to the order book
   */
  addOrder(order) {
    const { stock_symbol, order_type } = order;
    
    // Initialize order book for stock if not exists
    if (!this.orderBooks[stock_symbol]) {
      this.orderBooks[stock_symbol] = {
        bids: [], // Buy orders (sorted high to low)
        asks: []  // Sell orders (sorted low to high)
      };
    }

    // Store order
    this.orders[order.order_id] = order;

    // Add to appropriate side of order book
    if (order_type === 'BUY' || order_type === 0) {
      this.orderBooks[stock_symbol].bids.push(order);
      // Sort bids: highest price first
      this.orderBooks[stock_symbol].bids.sort((a, b) => b.price - a.price);
    } else {
      this.orderBooks[stock_symbol].asks.push(order);
      // Sort asks: lowest price first
      this.orderBooks[stock_symbol].asks.sort((a, b) => a.price - b.price);
    }

    logger.info('Order added to book', {
      orderId: order.order_id,
      symbol: stock_symbol,
      type: order_type,
      price: order.price,
      quantity: order.quantity
    });

    // Emit ORDER_PLACED event
    this.emitEvent({
      event_type: 'ORDER_PLACED',
      order_id: order.order_id,
      stock_symbol: order.stock_symbol,
      order_type: order.order_type,
      quantity: order.quantity,
      price: order.price,
      investor_id: order.investor_id,
      timestamp: Date.now()
    });

    // Try to match orders
    return this.matchOrders(stock_symbol);
  }

  /**
   * Match orders for a given stock
   */
  matchOrders(stockSymbol) {
    const executions = [];
    const book = this.orderBooks[stockSymbol];
    
    if (!book || book.bids.length === 0 || book.asks.length === 0) {
      return executions;
    }

    // Continue matching while there are compatible orders
    while (book.bids.length > 0 && book.asks.length > 0) {
      const bid = book.bids[0]; // Highest buy price
      const ask = book.asks[0]; // Lowest sell price

      // Check if orders can be matched
      // For market orders (price = 0), always match
      // For limit orders, bid price must be >= ask price
      const canMatch = (bid.price === 0 || ask.price === 0 || bid.price >= ask.price);

      if (!canMatch) {
        break; // No more matches possible
      }

      // Determine execution price (usually the earlier order's price)
      // If one is a market order, use the limit order's price
      let executionPrice;
      if (bid.price === 0) {
        executionPrice = ask.price;
      } else if (ask.price === 0) {
        executionPrice = bid.price;
      } else {
        // Use the ask price (seller's price)
        executionPrice = ask.price;
      }

      // Determine execution quantity (minimum of both orders)
      const executionQuantity = Math.min(
        bid.quantity - bid.filled_quantity,
        ask.quantity - ask.filled_quantity
      );

      // Create execution record
      const execution = {
        execution_id: uuidv4(),
        buy_order_id: bid.order_id,
        sell_order_id: ask.order_id,
        stock_symbol: stockSymbol,
        quantity: executionQuantity,
        price: executionPrice,
        buyer_id: bid.investor_id,
        seller_id: ask.investor_id,
        timestamp: Date.now()
      };

      executions.push(execution);

      // Update filled quantities
      bid.filled_quantity = (bid.filled_quantity || 0) + executionQuantity;
      ask.filled_quantity = (ask.filled_quantity || 0) + executionQuantity;

      // Update order statuses
      if (bid.filled_quantity >= bid.quantity) {
        bid.status = 'FILLED';
        book.bids.shift(); // Remove from book
      } else {
        bid.status = 'PARTIALLY_FILLED';
      }

      if (ask.filled_quantity >= ask.quantity) {
        ask.status = 'FILLED';
        book.asks.shift(); // Remove from book
      } else {
        ask.status = 'PARTIALLY_FILLED';
      }

      logger.info('Order matched', {
        executionId: execution.execution_id,
        symbol: stockSymbol,
        quantity: executionQuantity,
        price: executionPrice,
        buyOrderId: bid.order_id,
        sellOrderId: ask.order_id
      });

      // Emit ORDER_EXECUTED events
      this.emitEvent({
        event_type: 'ORDER_EXECUTED',
        order_id: bid.order_id,
        stock_symbol: stockSymbol,
        order_type: 'BUY',
        quantity: executionQuantity,
        price: executionPrice,
        investor_id: bid.investor_id,
        timestamp: execution.timestamp
      });

      this.emitEvent({
        event_type: 'ORDER_EXECUTED',
        order_id: ask.order_id,
        stock_symbol: stockSymbol,
        order_type: 'SELL',
        quantity: executionQuantity,
        price: executionPrice,
        investor_id: ask.investor_id,
        timestamp: execution.timestamp
      });
    }

    return executions;
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId, investorId) {
    const order = this.orders[orderId];

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    if (order.investor_id !== investorId) {
      return { success: false, message: 'Unauthorized to cancel this order' };
    }

    if (order.status === 'FILLED' || order.status === 'CANCELED') {
      return { success: false, message: `Order already ${order.status}` };
    }

    // Remove from order book
    const book = this.orderBooks[order.stock_symbol];
    if (book) {
      if (order.order_type === 'BUY' || order.order_type === 0) {
        book.bids = book.bids.filter(o => o.order_id !== orderId);
      } else {
        book.asks = book.asks.filter(o => o.order_id !== orderId);
      }
    }

    // Update order status
    order.status = 'CANCELED';

    logger.info('Order canceled', { orderId, investorId });

    // Emit ORDER_CANCELED event
    this.emitEvent({
      event_type: 'ORDER_CANCELED',
      order_id: orderId,
      stock_symbol: order.stock_symbol,
      order_type: order.order_type,
      quantity: order.quantity - (order.filled_quantity || 0),
      price: order.price,
      investor_id: order.investor_id,
      timestamp: Date.now()
    });

    return { success: true, message: 'Order canceled successfully' };
  }

  /**
   * Get order status
   */
  getOrderStatus(orderId) {
    const order = this.orders[orderId];
    
    if (!order) {
      return null;
    }

    return {
      order_id: orderId,
      status: order.status,
      filled_quantity: order.filled_quantity || 0,
      remaining_quantity: order.quantity - (order.filled_quantity || 0),
      average_price: order.price
    };
  }

  /**
   * Get order book for a stock
   */
  getOrderBook(stockSymbol) {
    const book = this.orderBooks[stockSymbol];
    
    if (!book) {
      return { bids: [], asks: [] };
    }

    // Aggregate orders by price level
    const aggregateBids = this.aggregateOrders(book.bids);
    const aggregateAsks = this.aggregateOrders(book.asks);

    return {
      stock_symbol: stockSymbol,
      bids: aggregateBids,
      asks: aggregateAsks
    };
  }

  /**
   * Aggregate orders by price level
   */
  aggregateOrders(orders) {
    const priceMap = new Map();

    orders.forEach(order => {
      const remainingQty = order.quantity - (order.filled_quantity || 0);
      const price = order.price;

      if (priceMap.has(price)) {
        const entry = priceMap.get(price);
        entry.quantity += remainingQty;
        entry.order_count += 1;
      } else {
        priceMap.set(price, {
          price,
          quantity: remainingQty,
          order_count: 1
        });
      }
    });

    return Array.from(priceMap.values());
  }

  /**
   * Subscribe to market events
   */
  subscribe(callback) {
    this.eventSubscribers.add(callback);
    return () => this.eventSubscribers.delete(callback);
  }

  /**
   * Emit event to all subscribers
   */
  emitEvent(event) {
    this.eventSubscribers.forEach(callback => {
      try {
        callback(event);
      } catch (err) {
        logger.error('Error in event subscriber', { error: err.message });
      }
    });
  }

  /**
   * Get all orders for an investor
   */
  getInvestorOrders(investorId) {
    return Object.values(this.orders).filter(
      order => order.investor_id === investorId
    );
  }
}

export default MatchingEngine;

