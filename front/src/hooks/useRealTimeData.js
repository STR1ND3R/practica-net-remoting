import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for real-time data updates using polling
 * Can be extended to use WebSockets or Server-Sent Events
 */
export const useRealTimeData = (fetchFunction, interval = 5000, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchFunction();
      setData(result);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
      setLoading(false);
    }
  }, [fetchFunction]);

  useEffect(() => {
    // Initial fetch
    fetchData();

    // Set up polling
    if (interval > 0) {
      intervalRef.current = setInterval(fetchData, interval);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, interval, ...dependencies]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
};

/**
 * Hook for managing multiple real-time data streams
 */
export const useMultipleStreams = (streams) => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const intervalIds = [];

    const initializeStreams = async () => {
      const initialData = {};
      const initialErrors = {};

      // Fetch initial data for all streams
      await Promise.all(
        Object.entries(streams).map(async ([key, { fetchFunction, interval = 5000 }]) => {
          try {
            const result = await fetchFunction();
            initialData[key] = result;
          } catch (err) {
            initialErrors[key] = err.message;
          }

          // Set up polling for each stream
          if (interval > 0) {
            const intervalId = setInterval(async () => {
              try {
                const result = await fetchFunction();
                setData((prev) => ({ ...prev, [key]: result }));
                setErrors((prev) => ({ ...prev, [key]: null }));
              } catch (err) {
                setErrors((prev) => ({ ...prev, [key]: err.message }));
              }
            }, interval);
            intervalIds.push(intervalId);
          }
        })
      );

      setData(initialData);
      setErrors(initialErrors);
      setLoading(false);
    };

    initializeStreams();

    // Cleanup
    return () => {
      intervalIds.forEach((id) => clearInterval(id));
    };
  }, []);

  return { data, loading, errors };
};

/**
 * Hook for managing WebSocket connections (future implementation)
 */
export const useWebSocket = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // WebSocket implementation
    // This is a placeholder for future WebSocket support
    const connect = () => {
      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const parsedData = JSON.parse(event.data);
            setData(parsedData);
            if (options.onMessage) {
              options.onMessage(parsedData);
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnected(false);
          // Attempt reconnection after delay
          if (options.reconnect !== false) {
            setTimeout(connect, options.reconnectInterval || 5000);
          }
        };

        wsRef.current = ws;
      } catch (err) {
        setError(err.message);
      }
    };

    // Only connect if URL is provided
    if (url) {
      connect();
    }

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  const send = useCallback((message) => {
    if (wsRef.current && connected) {
      wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
    }
  }, [connected]);

  return { data, connected, error, send };
};

/**
 * Hook for real-time price streaming using Server-Sent Events (SSE)
 */
export const usePriceStream = (onPriceUpdate) => {
  const [prices, setPrices] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const url = `${API_BASE_URL}/api/stream/prices`;

    console.log('🔌 Connecting to price stream:', url);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ Price stream connected');
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'CONNECTED') {
            console.log('📡', data.message);
            return;
          }
          
          if (data.type === 'PRICE_UPDATE' && data.data) {
            const stock = data.data;
            
            // Update prices state
            setPrices(prev => ({
              ...prev,
              [stock.stock_symbol]: stock
            }));
            
            // Call callback if provided
            if (onPriceUpdate) {
              onPriceUpdate(stock);
            }
          }
        } catch (err) {
          console.error('Failed to parse price update:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('❌ Price stream error:', err);
        setError('Connection error. Reconnecting...');
        setConnected(false);
      };

    } catch (err) {
      console.error('Failed to create EventSource:', err);
      setError(err.message);
    }

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        console.log('🔌 Disconnecting from price stream');
        eventSourceRef.current.close();
      }
    };
  }, [onPriceUpdate]);

  return { prices, connected, error };
};

/**
 * Hook for market events streaming using Server-Sent Events (SSE)
 */
export const useMarketEventStream = (onMarketEvent) => {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const url = `${API_BASE_URL}/api/stream/market-events`;

    console.log('🔌 Connecting to market events stream:', url);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ Market events stream connected');
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'CONNECTED') {
            console.log('📡', data.message);
            return;
          }
          
          // Add event to history (keep last 100)
          setEvents(prev => [data, ...prev].slice(0, 100));
          
          // Call callback if provided
          if (onMarketEvent) {
            onMarketEvent(data);
          }
        } catch (err) {
          console.error('Failed to parse market event:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('❌ Market events stream error:', err);
        setError('Connection error. Reconnecting...');
        setConnected(false);
      };

    } catch (err) {
      console.error('Failed to create EventSource:', err);
      setError(err.message);
    }

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        console.log('🔌 Disconnecting from market events stream');
        eventSourceRef.current.close();
      }
    };
  }, [onMarketEvent]);

  return { events, connected, error };
};

export default useRealTimeData;

