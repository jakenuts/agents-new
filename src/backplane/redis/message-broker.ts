import { RedisClientType } from 'redis';

export class RedisMessageBroker {
  constructor(
    protected readonly client: RedisClientType,
    protected readonly prefix: string,
    protected readonly channel: string
  ) {}

  async sendMessage(to: string, message: any): Promise<void> {
    await this.client.publish(
      `${this.prefix}message:${to}`,
      JSON.stringify(message)
    );
  }

  async broadcastMessage(message: any): Promise<void> {
    await this.client.publish(
      this.channel,
      JSON.stringify(message)
    );
  }
}
