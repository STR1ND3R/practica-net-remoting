import express from 'express';
import { config } from '../shared/config.js';
import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';
import WebhookManager from './webhook-manager.js';

const logger = createServiceLogger('WEBHOOK-SERVICE');

const app = express();
app.use(express.json());

// Initialize webhook manager
const webhookManager = new WebhookManager();

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'webhook-service' });
});

/**
 * Register a new webhook
 */
app.post('/webhooks', async (req, res) => {
  try {
    const { url, events } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Events array is required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }

    const webhook = await webhookManager.registerWebhook(url, events);

    res.status(201).json({
      success: true,
      webhook
    });
  } catch (err) {
    logger.error('Failed to register webhook', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Get all webhooks
 */
app.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await webhookManager.getAllWebhooks();
    res.json({
      success: true,
      webhooks,
      count: webhooks.length
    });
  } catch (err) {
    logger.error('Failed to get webhooks', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Get webhook by ID
 */
app.get('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = await webhookManager.getWebhook(parseInt(id));
    
    res.json({
      success: true,
      webhook
    });
  } catch (err) {
    if (err.message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        message: err.message
      });
    }

    logger.error('Failed to get webhook', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Delete webhook
 */
app.delete('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await webhookManager.deleteWebhook(parseInt(id));
    
    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  } catch (err) {
    if (err.message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        message: err.message
      });
    }

    logger.error('Failed to delete webhook', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Update webhook status
 */
app.patch('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Active status (boolean) is required'
      });
    }

    await webhookManager.updateWebhookStatus(parseInt(id), active);
    
    res.json({
      success: true,
      message: 'Webhook status updated successfully'
    });
  } catch (err) {
    if (err.message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        message: err.message
      });
    }

    logger.error('Failed to update webhook status', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Send test notification
 */
app.post('/webhooks/test', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    const result = await webhookManager.sendTestNotification(url);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    logger.error('Failed to send test notification', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Dispatch event (called by other services)
 */
app.post('/events', async (req, res) => {
  try {
    const { event_type, event_data } = req.body;

    if (!event_type) {
      return res.status(400).json({
        success: false,
        message: 'Event type is required'
      });
    }

    await webhookManager.dispatchEvent(event_type, event_data || {});

    res.json({
      success: true,
      message: 'Event dispatched successfully'
    });
  } catch (err) {
    logger.error('Failed to dispatch event', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Get available event types
 */
app.get('/events/types', (req, res) => {
  res.json({
    success: true,
    event_types: [
      'ORDER_PLACED',
      'ORDER_EXECUTED',
      'ORDER_CANCELED',
      'PRICE_UPDATE',
      'PRICE_ALERT',
      'BALANCE_UPDATED',
      'NEW_TRANSACTION',
      'TOP_STOCKS_UPDATED',
      'PREDICTION_AVAILABLE'
    ]
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize database
    await database.initialize();

    const port = config.webhookService.port;

    app.listen(port, () => {
      logger.info(`Webhook Service started on http://0.0.0.0:${port}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Webhook Service...');
      await database.close();
      process.exit(0);
    });

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;

