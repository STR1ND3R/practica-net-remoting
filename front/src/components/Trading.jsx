import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { 
  priceService, 
  marketService, 
  investorService 
} from '../services/api';
import { useRealTimeData, usePriceStream, useMarketEventStream } from '../hooks/useRealTimeData';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  Search,
  DollarSign,
  Activity,
  Zap
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const Trading = () => {
  const { currentInvestor, addNotification, updateInvestor } = useApp();
  const [selectedStock, setSelectedStock] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [orderType, setOrderType] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [orderBookData, setOrderBookData] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [priceUpdates, setPriceUpdates] = useState({}); // Track recent price changes

  // Fetch initial stocks
  const { 
    data: stocksData, 
    refresh: refreshStocks 
  } = useRealTimeData(
    () => priceService.getAllStocks(),
    0 // Only fetch once, SSE will handle updates
  );

  useEffect(() => {
    if (stocksData) {
      setStocks(stocksData.stocks || []);
      if (!selectedStock && stocksData.stocks?.length > 0) {
        setSelectedStock(stocksData.stocks[0]);
      }
    }
  }, [stocksData]);

  // Handle real-time price updates
  const handlePriceUpdate = useCallback((updatedStock) => {
    // Update stocks list
    setStocks(prevStocks => 
      prevStocks.map(stock => 
        stock.stock_symbol === updatedStock.stock_symbol 
          ? updatedStock 
          : stock
      )
    );

    // Update selected stock if it matches
    setSelectedStock(prevSelected => 
      prevSelected && prevSelected.stock_symbol === updatedStock.stock_symbol
        ? updatedStock
        : prevSelected
    );

    // Track the update for visual feedback
    setPriceUpdates(prev => ({
      ...prev,
      [updatedStock.stock_symbol]: {
        timestamp: Date.now(),
        change: updatedStock.change_percent
      }
    }));

    // Clear the update indicator after 2 seconds
    setTimeout(() => {
      setPriceUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[updatedStock.stock_symbol];
        return newUpdates;
      });
    }, 2000);
  }, []);

  // Handle market events
  const handleMarketEvent = useCallback((event) => {
    if (event.type === 'ORDER_EXECUTED') {
      // Show notification for trades (optional, can be filtered for current investor)
      if (event.investor_id === currentInvestor?.investor_id) {
        addNotification({
          type: 'success',
          message: `✅ ${event.order_type} order executed: ${event.quantity} ${event.stock_symbol} @ $${event.price.toFixed(2)}`
        });
      }
    }
  }, [currentInvestor, addNotification]);

  // Connect to real-time price stream
  const { prices: streamPrices, connected: priceStreamConnected } = usePriceStream(handlePriceUpdate);
  
  // Connect to market events stream
  const { events: marketEvents, connected: eventsStreamConnected } = useMarketEventStream(handleMarketEvent);

  // Fetch order book for selected stock
  useEffect(() => {
    const fetchOrderBook = async () => {
      if (selectedStock) {
        try {
          const orderBook = await marketService.getOrderBook(selectedStock.stock_symbol);
          setOrderBookData(orderBook);
        } catch (error) {
          console.error('Failed to fetch order book:', error);
        }
      }
    };

    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, [selectedStock]);

  // Fetch price history
  useEffect(() => {
    const fetchPriceHistory = async () => {
      if (selectedStock) {
        try {
          const endTime = Date.now();
          const startTime = endTime - (24 * 60 * 60 * 1000); // Last 24 hours
          const history = await priceService.getPriceHistory(
            selectedStock.stock_symbol,
            startTime,
            endTime,
            50
          );
          
          if (history.prices) {
            const formattedData = history.prices.map(p => ({
              time: new Date(p.timestamp).toLocaleTimeString(),
              price: p.price,
              volume: p.volume || 0
            }));
            setPriceHistory(formattedData);
          }
        } catch (error) {
          console.error('Failed to fetch price history:', error);
        }
      }
    };

    fetchPriceHistory();
    const interval = setInterval(fetchPriceHistory, 30000);
    return () => clearInterval(interval);
  }, [selectedStock]);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    
    if (!selectedStock || !quantity) {
      addNotification({ 
        type: 'error', 
        message: 'Please fill in all required fields' 
      });
      return;
    }

    setLoading(true);
    
    const orderQuantity = parseInt(quantity);
    const orderPrice = price ? parseFloat(price) : selectedStock.current_price;
    const isBuy = orderType === 'BUY';
    
    // Optimistic update - Update UI immediately
    const totalValue = orderQuantity * orderPrice;
    const optimisticBalance = isBuy 
      ? currentInvestor.balance - totalValue 
      : currentInvestor.balance + totalValue;
    
    // Show immediate feedback
    addNotification({
      type: 'info',
      message: `⚡ Processing ${orderType} order for ${orderQuantity} ${selectedStock.stock_symbol}...`
    });

    try {
      // Validate order first
      const validation = await investorService.validateOrder({
        investor_id: currentInvestor.investor_id,
        stock_symbol: selectedStock.stock_symbol,
        order_type: orderType,
        quantity: orderQuantity,
        price: price ? parseFloat(price) : 0
      });

      if (!validation.valid) {
        addNotification({ 
          type: 'error', 
          message: validation.message 
        });
        return;
      }

      // Place the order
      const result = await marketService.placeOrder({
        investor_id: currentInvestor.investor_id,
        stock_symbol: selectedStock.stock_symbol,
        order_type: orderType === 'BUY' ? 0 : 1,
        quantity: orderQuantity,
        price: price ? parseFloat(price) : 0
      });

      if (result.success) {
        // Order executed successfully!
        addNotification({ 
          type: 'success', 
          message: `✅ ${result.message}${result.price_change ? ` | Price ${result.price_change > 0 ? '📈' : '📉'} $${Math.abs(result.price_change).toFixed(2)}` : ''}` 
        });
        
        // Update investor balance optimistically
        updateInvestor({ balance: optimisticBalance });
        
        // Fetch updated investor data
        setTimeout(async () => {
          try {
            const updatedInvestor = await investorService.getInvestor(currentInvestor.investor_id);
            updateInvestor(updatedInvestor);
          } catch (err) {
            console.error('Failed to fetch updated investor:', err);
          }
        }, 500);
        
        // Clear form
        setQuantity('');
        setPrice('');
        
        // Note: No need to refresh stocks - SSE will handle it automatically!
      } else {
        addNotification({ 
          type: 'error', 
          message: result.message || 'Failed to place order' 
        });
      }
    } catch (error) {
      addNotification({ 
        type: 'error', 
        message: error.message || 'Failed to place order' 
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredStocks = stocks.filter(stock =>
    stock.stock_symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateOrderValue = () => {
    if (!quantity) return 0;
    const orderPrice = price || selectedStock?.current_price || 0;
    return parseInt(quantity) * parseFloat(orderPrice);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trading</h1>
          <div className="mt-1 flex items-center space-x-3">
            <p className="text-sm text-gray-500">
              Buy and sell stocks in real-time
            </p>
            {priceStreamConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <Zap className="h-3 w-3 animate-pulse" />
                <span>Live Prices</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
            <div className={`h-2 w-2 rounded-full ${
              priceStreamConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-xs font-medium text-gray-600">
              {priceStreamConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          <button
            onClick={refreshStocks}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search stocks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredStocks.map((stock) => {
              const hasRecentUpdate = priceUpdates[stock.stock_symbol];
              const isUpdating = hasRecentUpdate && (Date.now() - hasRecentUpdate.timestamp < 2000);
              
              return (
                <div
                  key={stock.stock_symbol}
                  onClick={() => setSelectedStock(stock)}
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
                    selectedStock?.stock_symbol === stock.stock_symbol
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  } ${isUpdating ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <div>
                        <div className="flex items-center space-x-1">
                          <p className="font-semibold text-gray-900">
                            {stock.stock_symbol}
                          </p>
                          {isUpdating && (
                            <Zap className="h-3 w-3 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {stock.company_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold transition-colors ${
                        isUpdating ? 'text-yellow-600' : 'text-gray-900'
                      }`}>
                        ${stock.current_price?.toFixed(2)}
                      </p>
                      <p className={`text-xs flex items-center justify-end ${
                        stock.change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stock.change_percent >= 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {stock.change_percent >= 0 ? '+' : ''}
                        {stock.change_percent?.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trading Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stock Details */}
          {selectedStock && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedStock.stock_symbol}
                  </h2>
                  <p className="text-gray-500">{selectedStock.company_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-gray-900">
                    ${selectedStock.current_price?.toFixed(2)}
                  </p>
                  <p className={`text-sm flex items-center justify-end ${
                    selectedStock.change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {selectedStock.change_percent >= 0 ? '+' : ''}
                    {selectedStock.change_percent?.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Stock Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Open</p>
                  <p className="text-sm font-semibold text-gray-900">
                    ${selectedStock.open_price?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">High</p>
                  <p className="text-sm font-semibold text-green-600">
                    ${selectedStock.high_price?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Low</p>
                  <p className="text-sm font-semibold text-red-600">
                    ${selectedStock.low_price?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Volume</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedStock.volume?.toLocaleString() || '0'}
                  </p>
                </div>
              </div>

              {/* Price Chart */}
              {priceHistory.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Price History (24h)
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="time" 
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fontSize: 10 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Order Form */}
              <form onSubmit={handlePlaceOrder} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order Type
                    </label>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => setOrderType('BUY')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          orderType === 'BUY'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('SELL')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          orderType === 'SELL'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Sell
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="Number of shares"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price (Leave empty for market price)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={`Market: $${selectedStock.current_price?.toFixed(2)}`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Order Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Order Value:</span>
                    <span className="text-lg font-semibold text-gray-900">
                      ${calculateOrderValue().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Available Balance:</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${currentInvestor?.balance?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !quantity}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                    orderType === 'BUY'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {loading ? 'Processing...' : `${orderType} ${selectedStock.stock_symbol}`}
                </button>
              </form>
            </div>
          )}

          {/* Order Book */}
          {orderBookData && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Order Book - {selectedStock?.stock_symbol}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Bids */}
                <div>
                  <h4 className="text-sm font-medium text-green-600 mb-2">
                    Bids (Buy Orders)
                  </h4>
                  <div className="space-y-1">
                    {orderBookData.bids?.slice(0, 10).map((bid, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-green-50 rounded">
                        <span className="text-gray-900">${bid.price.toFixed(2)}</span>
                        <span className="text-gray-600">{bid.quantity}</span>
                      </div>
                    ))}
                    {(!orderBookData.bids || orderBookData.bids.length === 0) && (
                      <p className="text-sm text-gray-500 text-center py-4">No buy orders</p>
                    )}
                  </div>
                </div>

                {/* Asks */}
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-2">
                    Asks (Sell Orders)
                  </h4>
                  <div className="space-y-1">
                    {orderBookData.asks?.slice(0, 10).map((ask, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-red-50 rounded">
                        <span className="text-gray-900">${ask.price.toFixed(2)}</span>
                        <span className="text-gray-600">{ask.quantity}</span>
                      </div>
                    ))}
                    {(!orderBookData.asks || orderBookData.asks.length === 0) && (
                      <p className="text-sm text-gray-500 text-center py-4">No sell orders</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Trading;

