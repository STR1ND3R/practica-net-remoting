import axios from 'axios';
import { createServiceLogger } from '../shared/logger.js';
import database from '../shared/database.js';

const logger = createServiceLogger('WEBHOOK-MANAGER');

class WebhookManager {
  constructor() {
    this.deliveryQueue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Register a new webhook
   */
  async registerWebhook(url, events) {
    try {
      const eventsStr = JSON.stringify(events);
      const createdAt = Date.now();

      const result = await database.run(
        'INSERT INTO webhooks (url, events, active, created_at) VALUES (?, ?, ?, ?)',
        [url, eventsStr, 1, createdAt]
      );

      logger.info('Webhook registered', { id: result.lastID, url, events });

      return {
        id: result.lastID,
        url,
        events,
        active: true,
        created_at: createdAt
      };
    } catch (err) {
      logger.error('Failed to register webhook', { error: err.message });
      throw err;
    }
  }

  /**
   * Get all webhooks
   */
  async getAllWebhooks() {
    try {
      const webhooks = await database.query('SELECT * FROM webhooks');
      
      return webhooks.map(wh => ({
        id: wh.id,
        url: wh.url,
        events: JSON.parse(wh.events),
        active: Boolean(wh.active),
        created_at: wh.created_at
      }));
    } catch (err) {
      logger.error('Failed to get webhooks', { error: err.message });
      throw err;
    }
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(id) {
    try {
      const webhook = await database.get('SELECT * FROM webhooks WHERE id = ?', [id]);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      return {
        id: webhook.id,
        url: webhook.url,
        events: JSON.parse(webhook.events),
        active: Boolean(webhook.active),
        created_at: webhook.created_at
      };
    } catch (err) {
      logger.error('Failed to get webhook', { id, error: err.message });
      throw err;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(id) {
    try {
      const result = await database.run('DELETE FROM webhooks WHERE id = ?', [id]);
      
      if (result.changes === 0) {
        throw new Error('Webhook not found');
      }

      logger.info('Webhook deleted', { id });
      return true;
    } catch (err) {
      logger.error('Failed to delete webhook', { id, error: err.message });
      throw err;
    }
  }

  /**
   * Update webhook active status
   */
  async updateWebhookStatus(id, active) {
    try {
      const result = await database.run(
        'UPDATE webhooks SET active = ? WHERE id = ?',
        [active ? 1 : 0, id]
      );

      if (result.changes === 0) {
        throw new Error('Webhook not found');
      }

      logger.info('Webhook status updated', { id, active });
      return true;
    } catch (err) {
      logger.error('Failed to update webhook status', { id, error: err.message });
      throw err;
    }
  }

  /**
   * Dispatch event to webhooks
   */
  async dispatchEvent(eventType, eventData) {
    try {
      // Get all active webhooks subscribed to this event
      const webhooks = await database.query(
        'SELECT * FROM webhooks WHERE active = 1'
      );

      const relevantWebhooks = webhooks.filter(wh => {
        const events = JSON.parse(wh.events);
        return events.includes(eventType) || events.includes('*');
      });

      if (relevantWebhooks.length === 0) {
        logger.debug('No webhooks subscribed to event', { eventType });
        return;
      }

      // Queue deliveries
      const deliveries = relevantWebhooks.map(wh => ({
        webhookId: wh.id,
        url: wh.url,
        eventType,
        eventData,
        retries: 0
      }));

      this.deliveryQueue.push(...deliveries);

      // Start processing queue if not already processing
      if (!this.isProcessing) {
        this.processDeliveryQueue();
      }

      logger.info('Event queued for delivery', {
        eventType,
        webhookCount: relevantWebhooks.length
      });
    } catch (err) {
      logger.error('Failed to dispatch event', { eventType, error: err.message });
    }
  }

  /**
   * Process delivery queue
   */
  async processDeliveryQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.deliveryQueue.length > 0) {
      const delivery = this.deliveryQueue.shift();
      await this.deliverWebhook(delivery);
    }

    this.isProcessing = false;
  }

  /**
   * Deliver webhook with retry logic
   */
  async deliverWebhook(delivery) {
    const { webhookId, url, eventType, eventData, retries } = delivery;

    try {
      const payload = {
        event: eventType,
        data: eventData,
        timestamp: Date.now()
      };

      logger.debug('Delivering webhook', { webhookId, url, eventType });

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'StockMarket-Webhook/1.0'
        },
        timeout: 5000
      });

      if (response.status >= 200 && response.status < 300) {
        logger.info('Webhook delivered successfully', {
          webhookId,
          url,
          eventType,
          status: response.status
        });
        return true;
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (err) {
      logger.warn('Webhook delivery failed', {
        webhookId,
        url,
        eventType,
        retries,
        error: err.message
      });

      // Retry logic
      if (retries < this.maxRetries) {
        setTimeout(() => {
          this.deliveryQueue.push({
            ...delivery,
            retries: retries + 1
          });

          if (!this.isProcessing) {
            this.processDeliveryQueue();
          }
        }, this.retryDelay * (retries + 1)); // Exponential backoff
      } else {
        logger.error('Webhook delivery failed after max retries', {
          webhookId,
          url,
          eventType
        });

        // Optionally disable webhook after repeated failures
        // await this.updateWebhookStatus(webhookId, false);
      }

      return false;
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification(url) {
    try {
      const payload = {
        event: 'TEST',
        data: {
          message: 'This is a test notification from Stock Market Simulator',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'StockMarket-Webhook/1.0'
        },
        timeout: 5000
      });

      logger.info('Test notification sent', { url, status: response.status });

      return {
        success: true,
        status: response.status,
        message: 'Test notification sent successfully'
      };
    } catch (err) {
      logger.error('Failed to send test notification', { url, error: err.message });
      return {
        success: false,
        status: 0,
        message: err.message
      };
    }
  }
}

export default WebhookManager;

