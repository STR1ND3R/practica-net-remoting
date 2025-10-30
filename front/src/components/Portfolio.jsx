import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { investorService, analyticsService } from '../services/api';
import { useRealTimeData, usePriceStream, useMarketEventStream } from '../hooks/useRealTimeData';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  Activity,
  Zap
} from 'lucide-react';
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Portfolio = () => {
  const { currentInvestor } = useApp();
  const [portfolio, setPortfolio] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [activeTab, setActiveTab] = useState('holdings');
  const [priceStreamConnected, setPriceStreamConnected] = useState(false);

  // Fetch portfolio data with shorter interval for responsiveness
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
    5000, // Refresh every 5 seconds
    [currentInvestor?.investor_id]
  );

  // Fetch transactions
  const {
    data: transactionsData,
    refresh: refreshTransactions
  } = useRealTimeData(
    async () => {
      if (currentInvestor?.investor_id) {
        return await investorService.getTransactionHistory(
          currentInvestor.investor_id,
          50
        );
      }
      return null;
    },
    15000,
    [currentInvestor?.investor_id]
  );

  // Fetch performance metrics
  const {
    data: performanceData,
    refresh: refreshPerformance
  } = useRealTimeData(
    async () => {
      if (currentInvestor?.investor_id) {
        return await analyticsService.getInvestorPerformance(
          currentInvestor.investor_id
        );
      }
      return null;
    },
    20000,
    [currentInvestor?.investor_id]
  );

  useEffect(() => {
    if (portfolioData) {
      setPortfolio(portfolioData);
    }
  }, [portfolioData]);

  useEffect(() => {
    if (transactionsData) {
      setTransactions(transactionsData.transactions || []);
    }
  }, [transactionsData]);

  useEffect(() => {
    if (performanceData) {
      setPerformance(performanceData);
    }
  }, [performanceData]);

  // Handle real-time price updates for portfolio holdings
  const handlePriceUpdate = useCallback((updatedStock) => {
    if (!portfolio?.holdings) return;
    
    // Update current prices in portfolio holdings
    setPortfolio(prevPortfolio => {
      if (!prevPortfolio?.holdings) return prevPortfolio;
      
      const updatedHoldings = prevPortfolio.holdings.map(holding => {
        if (holding.stock_symbol === updatedStock.stock_symbol) {
          return {
            ...holding,
            current_price: updatedStock.current_price
          };
        }
        return holding;
      });
      
      return {
        ...prevPortfolio,
        holdings: updatedHoldings
      };
    });
  }, [portfolio]);

  // Handle market events - auto-refresh on trades
  const handleMarketEvent = useCallback((event) => {
    if (event.type === 'ORDER_EXECUTED' && event.investor_id === currentInvestor?.investor_id) {
      console.log('📊 Order executed - refreshing portfolio...');
      // Refresh portfolio immediately when user's order is executed
      setTimeout(() => {
        refreshPortfolio();
        refreshTransactions();
        refreshPerformance();
      }, 500); // Small delay to ensure backend is updated
    }
  }, [currentInvestor, refreshPortfolio, refreshTransactions, refreshPerformance]);

  // Connect to real-time price stream
  const { prices: streamPrices, connected } = usePriceStream(handlePriceUpdate);
  
  useEffect(() => {
    setPriceStreamConnected(connected);
  }, [connected]);
  
  // Connect to market events stream
  const { events: marketEvents } = useMarketEventStream(handleMarketEvent);

  const refreshAll = () => {
    refreshPortfolio();
    refreshTransactions();
    refreshPerformance();
  };

  const calculatePortfolioMetrics = () => {
    if (!portfolio?.holdings || portfolio.holdings.length === 0) {
      return {
        totalValue: 0,
        totalCost: 0,
        totalPL: 0,
        totalPLPercent: 0
      };
    }

    let totalValue = 0;
    let totalCost = 0;

    portfolio.holdings.forEach(holding => {
      totalValue += holding.quantity * holding.current_price;
      totalCost += holding.quantity * holding.average_buy_price;
    });

    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPL, totalPLPercent };
  };

  const metrics = calculatePortfolioMetrics();

  // Prepare data for pie chart
  const portfolioPieData = portfolio?.holdings?.map((holding, index) => ({
    name: holding.stock_symbol,
    value: holding.quantity * holding.current_price,
    color: COLORS[index % COLORS.length]
  })) || [];

  // Prepare data for performance bar chart
  const performanceBarData = portfolio?.holdings?.map(holding => {
    const value = holding.quantity * holding.current_price;
    const cost = holding.quantity * holding.average_buy_price;
    const pl = value - cost;
    return {
      stock: holding.stock_symbol,
      'Profit/Loss': pl
    };
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
          <div className="mt-1 flex items-center space-x-3">
            <p className="text-sm text-gray-500">
              Track your investments and performance
            </p>
            {priceStreamConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <Zap className="h-3 w-3 animate-pulse" />
                <span>Live Updates</span>
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
            onClick={refreshAll}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${metrics.totalValue.toFixed(2)}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cost</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${metrics.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Profit/Loss</p>
              <p className={`mt-2 text-3xl font-semibold ${
                metrics.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${Math.abs(metrics.totalPL).toFixed(2)}
              </p>
              <p className={`text-sm ${
                metrics.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {metrics.totalPL >= 0 ? '+' : '-'}
                {Math.abs(metrics.totalPLPercent).toFixed(2)}%
              </p>
            </div>
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              metrics.totalPL >= 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {metrics.totalPL >= 0 ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Holdings</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {portfolio?.holdings?.length || 0}
              </p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <PieChart className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      {performance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Win Rate</p>
            <p className="text-2xl font-semibold text-gray-900">
              {performance.win_rate?.toFixed(1)}%
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {performance.winning_trades} wins / {performance.losing_trades} losses
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Trades</p>
            <p className="text-2xl font-semibold text-gray-900">
              {performance.total_trades || 0}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Avg: ${performance.average_trade_size?.toFixed(2) || '0.00'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Risk Level</p>
            <p className={`text-2xl font-semibold ${
              performance.risk_level === 'LOW' ? 'text-green-600' :
              performance.risk_level === 'HIGH' ? 'text-red-600' :
              'text-orange-600'
            }`}>
              {performance.risk_level || 'MEDIUM'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('holdings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'holdings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Holdings
            </button>
            <button
              onClick={() => setActiveTab('distribution')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'distribution'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Distribution
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'transactions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Transactions
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Holdings Tab */}
          {activeTab === 'holdings' && (
            <div>
              {portfolioLoading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : portfolio?.holdings && portfolio.holdings.length > 0 ? (
                <div className="space-y-4">
                  {portfolio.holdings.map((holding) => {
                    const value = holding.quantity * holding.current_price;
                    const cost = holding.quantity * holding.average_buy_price;
                    const pl = value - cost;
                    const plPercent = (pl / cost) * 100;

                    return (
                      <div
                        key={holding.stock_symbol}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <span className="text-blue-600 font-semibold text-sm">
                                {holding.stock_symbol.substring(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {holding.stock_symbol}
                              </p>
                              <p className="text-sm text-gray-500">
                                {holding.quantity} shares @ ${holding.current_price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-8">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Avg Cost</p>
                            <p className="text-sm font-medium text-gray-900">
                              ${holding.average_buy_price.toFixed(2)}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs text-gray-500">Value</p>
                            <p className="text-sm font-semibold text-gray-900">
                              ${value.toFixed(2)}
                            </p>
                          </div>

                          <div className="text-right min-w-[100px]">
                            <p className={`text-sm font-semibold flex items-center justify-end ${
                              pl >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {pl >= 0 ? (
                                <ArrowUpRight className="h-4 w-4 mr-1" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 mr-1" />
                              )}
                              ${Math.abs(pl).toFixed(2)}
                            </p>
                            <p className={`text-xs ${
                              pl >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {pl >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Performance Chart */}
                  {performanceBarData.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Performance by Stock
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={performanceBarData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="stock" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="Profit/Loss" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No holdings yet. Start trading to build your portfolio!
                </div>
              )}
            </div>
          )}

          {/* Distribution Tab */}
          {activeTab === 'distribution' && (
            <div>
              {portfolioPieData.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                      Portfolio Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartsPie>
                        <Pie
                          data={portfolioPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => 
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {portfolioPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => `$${value.toFixed(2)}`}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                      Holdings Breakdown
                    </h3>
                    <div className="space-y-3">
                      {portfolioPieData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div 
                              className="h-4 w-4 rounded"
                              style={{ backgroundColor: item.color }}
                            ></div>
                            <span className="font-medium text-gray-900">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">
                              ${item.value.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {((item.value / metrics.totalValue) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No holdings to display
                </div>
              )}
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              {transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Stock
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map((transaction) => (
                        <tr key={transaction.transaction_id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(transaction.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">
                            {transaction.stock_symbol}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              transaction.transaction_type === 'BUY'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {transaction.transaction_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {transaction.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${transaction.price.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            ${transaction.total_amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No transactions yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Portfolio;

