import React, { useState, useEffect } from 'react';
import { analyticsService, priceService } from '../services/api';
import { useRealTimeData } from '../hooks/useRealTimeData';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity,
  BarChart3,
  Target,
  Zap
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart
} from 'recharts';

const Analytics = () => {
  const [topTradedStocks, setTopTradedStocks] = useState([]);
  const [volatileStocks, setVolatileStocks] = useState([]);
  const [marketStats, setMarketStats] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [tradingVolume, setTradingVolume] = useState([]);

  // Fetch top traded stocks
  const {
    data: topTradedData,
    refresh: refreshTopTraded
  } = useRealTimeData(
    () => analyticsService.getTopTradedStocks(10, 86400000),
    20000
  );

  // Fetch volatile stocks
  const {
    data: volatileData,
    refresh: refreshVolatile
  } = useRealTimeData(
    () => analyticsService.getMostVolatileStocks(10, 86400000),
    20000
  );

  // Fetch market stats
  const {
    data: statsData,
    refresh: refreshStats
  } = useRealTimeData(
    () => analyticsService.getMarketStats(),
    15000
  );

  useEffect(() => {
    if (topTradedData) {
      setTopTradedStocks(topTradedData.stocks || []);
      if (!selectedStock && topTradedData.stocks?.length > 0) {
        setSelectedStock(topTradedData.stocks[0].stock_symbol);
      }
    }
  }, [topTradedData]);

  useEffect(() => {
    if (volatileData) {
      setVolatileStocks(volatileData.stocks || []);
    }
  }, [volatileData]);

  useEffect(() => {
    if (statsData) {
      setMarketStats(statsData);
    }
  }, [statsData]);

  // Fetch prediction when stock is selected
  useEffect(() => {
    const fetchPrediction = async () => {
      if (selectedStock) {
        try {
          const pred = await analyticsService.predictPrice(selectedStock, 60);
          setPrediction(pred);
        } catch (error) {
          console.error('Failed to fetch prediction:', error);
        }
      }
    };

    fetchPrediction();
  }, [selectedStock]);

  // Fetch trading volume for selected stock
  useEffect(() => {
    const fetchTradingVolume = async () => {
      if (selectedStock) {
        try {
          const endTime = Date.now();
          const startTime = endTime - (24 * 60 * 60 * 1000);
          const volume = await analyticsService.getTradingVolume(
            selectedStock,
            startTime,
            endTime,
            3600
          );

          if (volume.data) {
            const formattedData = volume.data.map(v => ({
              time: new Date(v.timestamp).toLocaleTimeString(),
              volume: v.volume,
              trades: v.trade_count
            }));
            setTradingVolume(formattedData);
          }
        } catch (error) {
          console.error('Failed to fetch trading volume:', error);
        }
      }
    };

    fetchTradingVolume();
  }, [selectedStock]);

  const refreshAll = () => {
    refreshTopTraded();
    refreshVolatile();
    refreshStats();
  };

  // Prepare data for volume comparison chart
  const volumeComparisonData = topTradedStocks.slice(0, 8).map(stock => ({
    stock: stock.stock_symbol,
    volume: stock.total_volume || 0,
    trades: stock.trade_count || 0
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Market insights and predictions
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Market Stats Cards */}
      {marketStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Trades</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {marketStats.total_trades_today || 0}
                </p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Trading Volume</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  ${((marketStats.total_volume_today || 0) / 1000000).toFixed(2)}M
                </p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Investors</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {marketStats.active_investors || 0}
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Market Sentiment</p>
                <p className={`mt-2 text-2xl font-semibold ${
                  marketStats.market_sentiment === 'BULLISH' 
                    ? 'text-green-600'
                    : marketStats.market_sentiment === 'BEARISH'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}>
                  {marketStats.market_sentiment || 'NEUTRAL'}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                marketStats.market_sentiment === 'BULLISH'
                  ? 'bg-green-100'
                  : marketStats.market_sentiment === 'BEARISH'
                  ? 'bg-red-100'
                  : 'bg-gray-100'
              }`}>
                {marketStats.market_sentiment === 'BULLISH' ? (
                  <TrendingUp className="h-6 w-6 text-green-600" />
                ) : marketStats.market_sentiment === 'BEARISH' ? (
                  <TrendingDown className="h-6 w-6 text-red-600" />
                ) : (
                  <Zap className="h-6 w-6 text-gray-600" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Traded Stocks */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Top Traded Stocks (24h)
          </h2>
          {topTradedStocks.length > 0 ? (
            <div className="space-y-3">
              {topTradedStocks.map((stock, index) => (
                <div
                  key={stock.stock_symbol}
                  onClick={() => setSelectedStock(stock.stock_symbol)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedStock === stock.stock_symbol
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-xs">
                        #{index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {stock.stock_symbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        {stock.trade_count} trades
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {(stock.total_volume || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Volume</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No trading data available
            </div>
          )}
        </div>

        {/* Most Volatile Stocks */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Most Volatile Stocks (24h)
          </h2>
          {volatileStocks.length > 0 ? (
            <div className="space-y-3">
              {volatileStocks.map((stock, index) => (
                <div
                  key={stock.stock_symbol}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <span className="text-orange-600 font-semibold text-xs">
                        #{index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {stock.stock_symbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${stock.current_price?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${
                      stock.volatility_percent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.volatility_percent >= 0 ? '+' : ''}
                      {stock.volatility_percent?.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-500">Volatility</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No volatility data available
            </div>
          )}
        </div>
      </div>

      {/* Trading Volume Chart */}
      {volumeComparisonData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Trading Volume Comparison
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="stock" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="volume" fill="#3b82f6" name="Volume" />
              <Bar dataKey="trades" fill="#10b981" name="Trades" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Selected Stock Analysis */}
      {selectedStock && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Prediction */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Price Prediction - {selectedStock}
            </h2>
            {prediction ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                  <span className="text-gray-700">Current Price</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${prediction.current_price?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                  <span className="text-gray-700">Predicted Price (1h)</span>
                  <span className="text-xl font-semibold text-green-600">
                    ${prediction.predicted_price?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
                  <span className="text-gray-700">Expected Change</span>
                  <span className={`text-xl font-semibold ${
                    prediction.predicted_change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {prediction.predicted_change >= 0 ? '+' : ''}
                    {prediction.predicted_change?.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Confidence</span>
                  <span className="text-xl font-semibold text-gray-900">
                    {prediction.confidence?.toFixed(0) || '0'}%
                  </span>
                </div>
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Recommendation:</strong> {prediction.recommendation || 'HOLD'}
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Based on historical data and market trends
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Loading prediction...
              </div>
            )}
          </div>

          {/* Trading Volume Timeline */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Trading Volume - {selectedStock}
            </h2>
            {tradingVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={tradingVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="volume" 
                    stroke="#3b82f6" 
                    fill="#93c5fd"
                    name="Volume"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Loading volume data...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;

