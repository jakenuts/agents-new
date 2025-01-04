import { logger } from '../logging/base.js';
import { LogComponent } from '../logging/types.js';

class MockRedisClient {
  private connected: boolean = false;
  private data: Map<string, string> = new Map();
  private subscribers: Map<string, Set<(message: string) => void>> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
    logger.info(LogComponent.BACKPLANE, 'Redis client connected');
  }

  async quit(): Promise<void> {
    this.connected = false;
    logger.info(LogComponent.BACKPLANE, 'Redis client disconnected');
  }

  duplicate(): MockRedisClient {
    const duplicateClient = new MockRedisClient();
    duplicateClient.data = new Map(this.data);
    duplicateClient.subscribers = new Map(this.subscribers);
    return duplicateClient;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    logger.info(LogComponent.BACKPLANE, 'Data stored in Redis', { key });
  }

  async get(key: string): Promise<string | null> {
    const value = this.data.get(key);
    logger.info(LogComponent.BACKPLANE, 'Data retrieved from Redis', { key });
    return value || null;
  }

  async publish(channel: string, message: string): Promise<void> {
    const subs = this.subscribers.get(channel) || new Set();
    subs.forEach(callback => callback(message));
    logger.info(LogComponent.BACKPLANE, 'Message published', { channel });
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)?.add(callback);
    logger.info(LogComponent.BACKPLANE, 'Subscribed to channel', { channel });
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscribers.delete(channel);
    logger.info(LogComponent.BACKPLANE, 'Unsubscribed from channel', { channel });
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.data.keys()).filter(key => key.includes(pattern));
    logger.info(LogComponent.BACKPLANE, 'Listed keys', { pattern, count: keys.length });
    return keys;
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
    logger.info(LogComponent.BACKPLANE, 'Key deleted', { key });
  }
}

export const createClient = () => new MockRedisClient();
