import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  priceService, 
  investorService, 
  analyticsService 
} from '../services/api';
import { useRealTimeData } from '../hooks/useRealTimeData';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

const Dashboard = () => {
  const { currentInvestor, updateInvestor } = useApp();
  const [portfolio, setPortfolio] = useState(null);
  const [marketStats, setMarketStats] = useState(null);
  const [topStocks, setTopStocks] = useState([]);

  // Fetch portfolio data
  const { 
    data: portfolioData, 
    loading: portfolioLoading,
    refresh: refreshPortfolio 
  } = useRealTimeData(
    async () => {
      if (currentInvestor?.investor_id) {
        return await investorService.getPortfolio(currentInvestor.investor_id);
      }
      return null;
    },
    10000, // Update every 10 seconds
    [currentInvestor?.investor_id]
  );

  // Fetch market stats
  const { 
    data: statsData, 
    refresh: refreshStats 
  } = useRealTimeData(
    () => analyticsService.getMarketStats(),
    15000 // Update every 15 seconds
  );

  // Fetch top traded stocks
  const { 
    data: topStocksData,
    refresh: refreshTopStocks
  } = useRealTimeData(
    () => analyticsService.getTopTradedStocks(5, 86400000), // Last 24 hours
    20000 // Update every 20 seconds
  );

  useEffect(() => {
    if (portfolioData) {
      setPortfolio(portfolioData);
    }
  }, [portfolioData]);

  useEffect(() => {
    if (statsData) {
      setMarketStats(statsData);
    }
  }, [statsData]);

  useEffect(() => {
    if (topStocksData) {
      setTopStocks(topStocksData.stocks || []);
    }
  }, [topStocksData]);

  const refreshAll = () => {
    refreshPortfolio();
    refreshStats();
    refreshTopStocks();
  };

  const calculatePortfolioValue = () => {
    if (!portfolio?.holdings) return 0;
    return portfolio.holdings.reduce((total, holding) => {
      return total + (holding.quantity * holding.current_price);
    }, 0);
  };

  const calculateProfitLoss = () => {
    if (!portfolio?.holdings) return { amount: 0, percentage: 0 };
    
    let totalValue = 0;
    let totalCost = 0;

    portfolio.holdings.forEach(holding => {
      totalValue += holding.quantity * holding.current_price;
      totalCost += holding.quantity * holding.average_buy_price;
    });

    const amount = totalValue - totalCost;
    const percentage = totalCost > 0 ? (amount / totalCost) * 100 : 0;

    return { amount, percentage };
  };

  const profitLoss = calculateProfitLoss();
  const portfolioValue = calculatePortfolioValue();
  const totalAssets = (currentInvestor?.balance || 0) + portfolioValue;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back, {currentInvestor?.name}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Assets */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${totalAssets.toFixed(2)}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Cash Balance</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${currentInvestor?.balance?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Portfolio Value */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Portfolio Value</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${portfolioValue.toFixed(2)}
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Profit/Loss */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total P&L</p>
              <p className={`mt-2 text-3xl font-semibold ${
                profitLoss.amount >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${Math.abs(profitLoss.amount).toFixed(2)}
              </p>
              <p className={`text-sm ${
                profitLoss.amount >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {profitLoss.percentage >= 0 ? '+' : '-'}
                {Math.abs(profitLoss.percentage).toFixed(2)}%
              </p>
            </div>
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              profitLoss.amount >= 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {profitLoss.amount >= 0 ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Holdings */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Portfolio Holdings
          </h2>
          {portfolioLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : portfolio?.holdings && portfolio.holdings.length > 0 ? (
            <div className="space-y-3">
              {portfolio.holdings.map((holding) => {
                const value = holding.quantity * holding.current_price;
                const cost = holding.quantity * holding.average_buy_price;
                const pl = value - cost;
                const plPercent = (pl / cost) * 100;

                return (
                  <div
                    key={holding.stock_symbol}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {holding.stock_symbol}
                      </p>
                      <p className="text-sm text-gray-500">
                        {holding.quantity} shares @ ${holding.current_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ${value.toFixed(2)}
                      </p>
                      <p className={`text-sm flex items-center justify-end ${
                        pl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {pl >= 0 ? (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 mr-1" />
                        )}
                        {pl >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No holdings yet. Start trading to build your portfolio!
            </div>
          )}
        </div>

        {/* Market Stats */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Market Overview
          </h2>
          {marketStats ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Total Trades Today</span>
                <span className="font-semibold text-gray-900">
                  {marketStats.total_trades_today || 0}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Trading Volume</span>
                <span className="font-semibold text-gray-900">
                  ${(marketStats.total_volume_today || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Active Investors</span>
                <span className="font-semibold text-gray-900">
                  {marketStats.active_investors || 0}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Active Stocks</span>
                <span className="font-semibold text-gray-900">
                  {marketStats.active_stocks || 0}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Market Sentiment</span>
                <span className={`font-semibold ${
                  marketStats.market_sentiment === 'BULLISH' 
                    ? 'text-green-600' 
                    : marketStats.market_sentiment === 'BEARISH'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}>
                  {marketStats.market_sentiment || 'NEUTRAL'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading market data...</div>
          )}
        </div>
      </div>

      {/* Top Traded Stocks */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Top Traded Stocks (24h)
        </h2>
        {topStocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Volume
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trades
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topStocks.map((stock) => (
                  <tr key={stock.stock_symbol}>
                    <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">
                      {stock.stock_symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {stock.total_volume?.toLocaleString() || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {stock.trade_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                      ${stock.current_price?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No trading data available
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

