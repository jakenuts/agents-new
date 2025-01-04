import { DiscoveryService } from './types.js';

export abstract class Backplane {
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
