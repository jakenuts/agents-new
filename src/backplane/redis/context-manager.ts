import { RedisClientType } from 'redis';

export class RedisContextManager {
  constructor(
    protected readonly client: RedisClientType,
    protected readonly prefix: string,
    protected readonly channel: string
  ) {}

  async shareContext(with_id: string, context: any): Promise<void> {
    const key = `${this.prefix}context:${with_id}`;
    await this.client.set(key, JSON.stringify(context));
    await this.client.publish(
      this.channel,
      JSON.stringify({
        type: 'context_update',
        agent_id: with_id,
        context
      })
    );
  }

  async getSharedContext(from_id: string): Promise<any> {
    const key = `${this.prefix}context:${from_id}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }
}
