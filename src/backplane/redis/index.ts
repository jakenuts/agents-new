import { createClient, RedisClientType } from 'redis';
import { BaseBackplane } from '../base.js';
import { BackplaneConfig } from '../types.js';
import { RedisMessageBroker } from './message-broker.js';
import { RedisContextManager } from './context-manager.js';
import { RedisDiscoveryService } from './discovery-service.js';

export interface RedisBackplaneConfig extends BackplaneConfig {
  prefix?: string; // Key prefix for Redis
  pubsub?: {
    messageChannel?: string;
    contextChannel?: string;
    discoveryChannel?: string;
  };
}

export class RedisBackplane extends BaseBackplane {
  private client: RedisClientType;
  private prefix: string;

  messageBroker: RedisMessageBroker;
  contextManager: RedisContextManager;
  discoveryService: RedisDiscoveryService;

  constructor(config?: RedisBackplaneConfig) {
    super();
    this.prefix = config?.prefix || 'agent-framework:';
    
    // Create Redis client
    this.client = createClient({
      url: `redis://${config?.host || 'localhost'}:${config?.port || 6379}`,
      username: config?.credentials?.username,
      password: config?.credentials?.password
    });

    // Create service instances
    this.messageBroker = new RedisMessageBroker(
      this.client,
      this.prefix,
      config?.pubsub?.messageChannel
    );

    this.contextManager = new RedisContextManager(
      this.client,
      this.prefix,
      config?.pubsub?.contextChannel
    );

    this.discoveryService = new RedisDiscoveryService(
      this.client,
      this.prefix,
      config?.pubsub?.discoveryChannel
    );
  }

  protected async initializeServices(): Promise<void> {
    // Connect Redis client
    await this.client.connect();

    // Initialize services
    await Promise.all([
      this.messageBroker.initialize(),
      this.contextManager.initialize(),
      this.discoveryService.initialize()
    ]);
  }

  async disconnect(): Promise<void> {
    try {
      await super.disconnect();
    } finally {
      await this.client.quit();
    }
  }
}
