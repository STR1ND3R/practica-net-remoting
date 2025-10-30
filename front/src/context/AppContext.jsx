import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [currentInvestor, setCurrentInvestor] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Load investor from localStorage on mount
  useEffect(() => {
    const savedInvestor = localStorage.getItem('currentInvestor');
    if (savedInvestor) {
      try {
        const investor = JSON.parse(savedInvestor);
        setCurrentInvestor(investor);
        setIsLoggedIn(true);
      } catch (err) {
        console.error('Failed to parse saved investor:', err);
        localStorage.removeItem('currentInvestor');
      }
    }
  }, []);

  const login = (investor) => {
    setCurrentInvestor(investor);
    setIsLoggedIn(true);
    localStorage.setItem('currentInvestor', JSON.stringify(investor));
  };

  const logout = () => {
    setCurrentInvestor(null);
    setIsLoggedIn(false);
    localStorage.removeItem('currentInvestor');
  };

  const updateInvestor = (updates) => {
    const updated = { ...currentInvestor, ...updates };
    setCurrentInvestor(updated);
    localStorage.setItem('currentInvestor', JSON.stringify(updated));
  };

  const addNotification = (notification) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, ...notification }]);
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const value = {
    currentInvestor,
    isLoggedIn,
    notifications,
    login,
    logout,
    updateInvestor,
    addNotification,
    removeNotification,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;

