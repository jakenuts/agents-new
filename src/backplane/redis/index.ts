import { RedisClientType, createClient } from 'redis';
import { Backplane, BackplaneConfig, BackplaneFactory } from '../base.js';
import { DiscoveryService, AgentInfo } from '../types.js';
import { RedisDiscoveryService } from '../redis/discovery-service.js';
import { RedisMessageBroker } from '../redis/message-broker.js';
import { RedisContextManager } from '../redis/context-manager.js';
import { logger } from '../../logging/base.js';
import { LogComponent } from '../../logging/types.js';

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
      this.logConnection(config);
      try {
        await this.client.connect();
        await this.discoveryService.initialize();
        this.isConnected = true;
        logger.info(LogComponent.BACKPLANE, 'Redis backplane connected successfully');
      } catch (error) {
        logger.error(LogComponent.BACKPLANE, 'Failed to connect to Redis backplane', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      this.logDisconnection();
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info(LogComponent.BACKPLANE, 'Redis backplane disconnected successfully');
      } catch (error) {
        logger.error(LogComponent.BACKPLANE, 'Error disconnecting from Redis backplane', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.isConnected) {
      this.logCleanup();
      try {
        await this.discoveryService.cleanup();
        await this.disconnect();
        logger.info(LogComponent.BACKPLANE, 'Redis backplane cleanup completed');
      } catch (error) {
        logger.error(LogComponent.BACKPLANE, 'Error during Redis backplane cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
  }

  getDiscoveryService(): DiscoveryService {
    return this.discoveryService;
  }

  async sendMessage(to: string, message: any): Promise<void> {
    this.logMessageSent(to, message.type);
    try {
      await this.messageBroker.sendMessage(to, message);
      logger.debug(LogComponent.BACKPLANE, 'Message sent successfully', {
        to,
        messageType: message.type,
        messageSize: JSON.stringify(message).length
      });
    } catch (error) {
      logger.error(LogComponent.BACKPLANE, 'Failed to send message', {
        to,
        messageType: message.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async broadcastMessage(message: any): Promise<void> {
    this.logMessageBroadcast(message.type);
    try {
      await this.messageBroker.broadcastMessage(message);
      logger.debug(LogComponent.BACKPLANE, 'Message broadcast successfully', {
        messageType: message.type,
        messageSize: JSON.stringify(message).length
      });
    } catch (error) {
      logger.error(LogComponent.BACKPLANE, 'Failed to broadcast message', {
        messageType: message.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async shareContext(with_id: string, context: any): Promise<void> {
    const contextSize = JSON.stringify(context).length;
    this.logContextShared(with_id, contextSize);
    try {
      await this.contextManager.shareContext(with_id, context);
      logger.debug(LogComponent.BACKPLANE, 'Context shared successfully', {
        with_id,
        contextSize
      });
    } catch (error) {
      logger.error(LogComponent.BACKPLANE, 'Failed to share context', {
        with_id,
        contextSize,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async findCollaborators(query: { role?: string; capabilities?: string[] }): Promise<string[]> {
    this.logCollaboratorSearch(query);
    try {
      const agents = await this.discoveryService.findAgents(query);
      const collaborators = agents.map((agent: AgentInfo) => agent.id);
      logger.debug(LogComponent.BACKPLANE, 'Found collaborators', {
        query,
        count: collaborators.length,
        collaborators
      });
      return collaborators;
    } catch (error) {
      logger.error(LogComponent.BACKPLANE, 'Failed to find collaborators', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export class RedisBackplaneFactory implements BackplaneFactory {
  createBackplane(config: BackplaneConfig): Backplane {
    return new RedisBackplane(config);
  }
}
