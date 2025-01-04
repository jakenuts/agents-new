import { DiscoveryService } from './types.js';
import { logger } from '../logging/base.js';
import { LogComponent } from '../logging/types.js';

export abstract class Backplane {
  protected logConnection(config: { host: string; port: number }): void {
    logger.info(LogComponent.BACKPLANE, 'Connecting to backplane', {
      host: config.host,
      port: config.port
    });
  }

  protected logDisconnection(): void {
    logger.info(LogComponent.BACKPLANE, 'Disconnecting from backplane');
  }

  protected logCleanup(): void {
    logger.info(LogComponent.BACKPLANE, 'Cleaning up backplane resources');
  }

  protected logMessageSent(to: string, messageType: string): void {
    logger.debug(LogComponent.BACKPLANE, 'Sending message', {
      to,
      messageType
    });
  }

  protected logMessageBroadcast(messageType: string): void {
    logger.debug(LogComponent.BACKPLANE, 'Broadcasting message', {
      messageType
    });
  }

  protected logContextShared(with_id: string, contextSize: number): void {
    logger.debug(LogComponent.BACKPLANE, 'Sharing context', {
      with_id,
      contextSize
    });
  }

  protected logCollaboratorSearch(query: { role?: string; capabilities?: string[] }): void {
    logger.debug(LogComponent.BACKPLANE, 'Searching for collaborators', {
      role: query.role,
      capabilities: query.capabilities
    });
  }

  abstract connect(config: { host: string; port: number }): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract cleanup(): Promise<void>;
  abstract getDiscoveryService(): DiscoveryService;
  abstract sendMessage(to: string, message: any): Promise<void>;
  abstract broadcastMessage(message: any): Promise<void>;
  abstract shareContext(with_id: string, context: any): Promise<void>;
  abstract findCollaborators(query: { role?: string; capabilities?: string[] }): Promise<string[]>;
}

export interface BackplaneConfig {
  host: string;
  port: number;
  prefix: string;
  pubsub: {
    messageChannel: string;
    contextChannel: string;
    discoveryChannel: string;
  };
}

export interface BackplaneFactory {
  createBackplane(config: BackplaneConfig): Backplane;
}
