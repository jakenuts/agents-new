import { RedisClientType } from 'redis';
import { MessageBroker, MessageEnvelope } from '../types.js';

export class RedisMessageBroker implements MessageBroker {
  private readonly messageChannel: string;
  private readonly messagePrefix: string;
  private subscriptions: Map<string, (message: MessageEnvelope) => Promise<void>> = new Map();

  constructor(
    private readonly client: RedisClientType,
    private readonly prefix: string,
    channel?: string
  ) {
    this.messageChannel = channel || `${prefix}messages`;
    this.messagePrefix = `${prefix}message:`;
  }

  async initialize(): Promise<void> {
    // Subscribe to message channel
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(this.messageChannel, async (message) => {
      try {
        const envelope = JSON.parse(message) as MessageEnvelope;
        
        // Store message in Redis for persistence
        await this.client.set(
          `${this.messagePrefix}${envelope.id}`,
          JSON.stringify(envelope),
          {
            EX: 86400 // 24 hour TTL
          }
        );

        // Notify subscribers
        for (const handler of this.subscriptions.values()) {
          try {
            await handler(envelope);
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
  }

  async connect(): Promise<void> {
    // Connection handled by backplane
  }

  async disconnect(): Promise<void> {
    // Cleanup subscriptions
    this.subscriptions.clear();
  }

  async publish(message: MessageEnvelope): Promise<void> {
    await this.client.publish(
      this.messageChannel,
      JSON.stringify(message)
    );
  }

  async subscribe(
    pattern: string,
    handler: (message: MessageEnvelope) => Promise<void>
  ): Promise<void> {
    this.subscriptions.set(pattern, handler);
  }

  async unsubscribe(pattern: string): Promise<void> {
    this.subscriptions.delete(pattern);
  }

  // Helper methods for message persistence
  async getMessage(id: string): Promise<MessageEnvelope | null> {
    const message = await this.client.get(`${this.messagePrefix}${id}`);
    return message ? JSON.parse(message) : null;
  }

  async getRecentMessages(limit: number = 100): Promise<MessageEnvelope[]> {
    const keys = await this.client.keys(`${this.messagePrefix}*`);
    const messages = await Promise.all(
      keys.slice(0, limit).map(key => this.client.get(key))
    );

    return messages
      .filter((m): m is string => m !== null)
      .map(m => JSON.parse(m));
  }
}
