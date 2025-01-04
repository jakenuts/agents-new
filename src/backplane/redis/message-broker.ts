import { RedisClientType } from 'redis';
import { logger } from '../../logging/base.js';
import { LogComponent } from '../../logging/types.js';

export class RedisMessageBroker {
  private readonly client: RedisClientType;
  private readonly prefix: string;
  private readonly channel: string;

  constructor(client: RedisClientType, prefix: string, channel: string) {
    this.client = client;
    this.prefix = prefix;
    this.channel = channel;
  }

  async sendMessage(to: string, message: any): Promise<void> {
    const key = `${this.prefix}:messages:${to}`;
    await this.client.publish(this.channel, JSON.stringify(message));
    logger.info(LogComponent.BACKPLANE, 'Message sent successfully', {
      recipient: to,
      messageType: message.type
    });
  }

  async broadcastMessage(message: any): Promise<void> {
    await this.client.publish(this.channel, JSON.stringify(message));
    logger.info(LogComponent.BACKPLANE, 'Message broadcast successfully', {
      messageType: message.type
    });
  }
}
