import { RedisClientType, createClient } from 'redis';
import { Backplane, BackplaneConfig, BackplaneFactory } from '../base.js';
import { DiscoveryService, AgentInfo } from '../types.js';
import { RedisDiscoveryService } from '../redis/discovery-service.js';
import { RedisMessageBroker } from '../redis/message-broker.js';
import { RedisContextManager } from '../redis/context-manager.js';

export class RedisBackplane extends Backplane {
  protected readonly client: RedisClientType;
  protected readonly discoveryService: RedisDiscoveryService;
  protected readonly messageBroker: RedisMessageBroker;
  protected readonly contextManager: RedisContextManager;
  private isConnected: boolean = false;

  constructor(config: BackplaneConfig) {
    super();
    this.client = createClient({
      url: `redis://${config.host}:${config.port}`
    });

    this.discoveryService = new RedisDiscoveryService(
      this.client,
      config.prefix,
      config.pubsub.discoveryChannel
    );

    this.messageBroker = new RedisMessageBroker(
      this.client,
      config.prefix,
      config.pubsub.messageChannel
    );

    this.contextManager = new RedisContextManager(
      this.client,
      config.prefix,
      config.pubsub.contextChannel
    );
  }

  async connect(config: { host: string; port: number }): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      await this.discoveryService.initialize();
      this.isConnected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.isConnected) {
      await this.discoveryService.cleanup();
      await this.disconnect();
    }
  }

  getDiscoveryService(): DiscoveryService {
    return this.discoveryService;
  }

  async sendMessage(to: string, message: any): Promise<void> {
    await this.messageBroker.sendMessage(to, message);
  }

  async broadcastMessage(message: any): Promise<void> {
    await this.messageBroker.broadcastMessage(message);
  }

  async shareContext(with_id: string, context: any): Promise<void> {
    await this.contextManager.shareContext(with_id, context);
  }

  async findCollaborators(query: { role?: string; capabilities?: string[] }): Promise<string[]> {
    const agents = await this.discoveryService.findAgents(query);
    return agents.map((agent: AgentInfo) => agent.id);
  }
}

export class RedisBackplaneFactory implements BackplaneFactory {
  createBackplane(config: BackplaneConfig): Backplane {
    return new RedisBackplane(config);
  }
}
