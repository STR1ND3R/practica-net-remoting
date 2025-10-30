import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { investorService } from '../services/api';
import { TrendingUp, User, Mail, DollarSign } from 'lucide-react';

const Login = () => {
  const { login, addNotification } = useApp();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  // Login form
  const [investorId, setInvestorId] = useState('');

  // Register form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [initialBalance, setInitialBalance] = useState('10000');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const investor = await investorService.getInvestor(investorId.trim());
      
      if (investor) {
        login(investor);
        addNotification({
          type: 'success',
          message: `Welcome back, ${investor.name}!`
        });
      } else {
        addNotification({
          type: 'error',
          message: 'Investor not found. Please check your ID or register.'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        message: error.message || 'Failed to login. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await investorService.registerInvestor({
        name: name.trim(),
        email: email.trim(),
        initial_balance: parseFloat(initialBalance)
      });

      if (result.success) {
        // Fetch the investor details
        const investor = await investorService.getInvestor(result.investor_id);
        
        login(investor);
        addNotification({
          type: 'success',
          message: `Registration successful! Welcome, ${investor.name}!`
        });
      } else {
        addNotification({
          type: 'error',
          message: result.message || 'Failed to register. Please try again.'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        message: error.message || 'Failed to register. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">StockMarket</h1>
          <p className="mt-2 text-gray-600">
            Distributed Stock Trading System
          </p>
        </div>

        {/* Login/Register Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Toggle Tabs */}
          <div className="flex space-x-2 mb-6">
            <button
              onClick={() => setIsRegister(false)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                !isRegister
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsRegister(true)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                isRegister
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Register
            </button>
          </div>

          {/* Login Form */}
          {!isRegister ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Investor ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={investorId}
                    onChange={(e) => setInvestorId(e.target.value)}
                    placeholder="Enter your investor ID"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <User className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Don't have an account? Switch to Register to create one.
              </p>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <User className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Balance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="10000"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <DollarSign className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum: $0.00
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Already have an account? Switch to Login.
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Powered by gRPC Microservices
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Market • Price • Investor • Analytics • Webhook Services
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

