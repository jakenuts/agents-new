import { RedisClientType } from 'redis';
import { DiscoveryService, AgentInfo } from '../types.js';

interface AgentRegistration extends AgentInfo {
  registeredAt: Date;
  lastHeartbeat: Date;
}

export class RedisDiscoveryService implements DiscoveryService {
  private readonly discoveryChannel: string;
  private readonly agentPrefix: string;
  private readonly heartbeatInterval: number = 30000; // 30 seconds
  private readonly agentTTL: number = 86400; // 24 hours
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private subscriber?: RedisClientType;
  private watchers: Set<(event: { type: 'add' | 'remove' | 'update'; agent: AgentInfo }) => void> = new Set();

  constructor(
    private readonly client: RedisClientType,
    private readonly prefix: string,
    channel?: string
  ) {
    this.discoveryChannel = channel || `${prefix}discovery`;
    this.agentPrefix = `${prefix}agent:`;
  }

  async initialize(): Promise<void> {
    // Subscribe to discovery events
    this.subscriber = this.client.duplicate();
    await this.subscriber.connect();

    await this.subscriber.subscribe(this.discoveryChannel, async (message) => {
      try {
        const event = JSON.parse(message) as {
          type: 'add' | 'remove' | 'update';
          agent: AgentInfo;
        };

        // Notify watchers
        for (const handler of this.watchers) {
          try {
            handler(event);
          } catch (error) {
            console.error('Error in discovery event handler:', error);
          }
        }
      } catch (error) {
        console.error('Error processing discovery event:', error);
      }
    });

    await this.startCleanup();
  }

  async cleanup(): Promise<void> {
    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Disconnect subscriber
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }

    // Clear watchers
    this.watchers.clear();
  }

  async registerAgent(info: AgentInfo): Promise<void> {
    const registration: AgentRegistration = {
      ...info,
      registeredAt: new Date(),
      lastHeartbeat: new Date()
    };

    // Store agent info
    const key = `${this.agentPrefix}${info.id}`;
    await this.client.set(
      key,
      JSON.stringify(registration),
      {
        EX: this.agentTTL
      }
    );

    // Publish registration event
    await this.client.publish(
      this.discoveryChannel,
      JSON.stringify({
        type: 'add',
        agent: info
      })
    );

    // Start heartbeat
    this.startHeartbeat(info.id);
  }

  async unregisterAgent(id: string): Promise<void> {
    // Remove agent info
    const key = `${this.agentPrefix}${id}`;
    const data = await this.client.get(key);
    if (data) {
      const info = JSON.parse(data) as AgentInfo;
      await this.client.del(key);

      // Publish unregistration event
      await this.client.publish(
        this.discoveryChannel,
        JSON.stringify({
          type: 'remove',
          agent: info
        })
      );
    }

    // Stop heartbeat
    this.stopHeartbeat();
  }

  async updateAgentStatus(id: string, status: AgentInfo['status']): Promise<void> {
    const key = `${this.agentPrefix}${id}`;
    const data = await this.client.get(key);
    if (!data) {
      throw new Error(`Agent ${id} not found`);
    }

    const registration = JSON.parse(data) as AgentRegistration;
    registration.status = status;
    registration.lastHeartbeat = new Date();

    // Update agent info
    await this.client.set(
      key,
      JSON.stringify(registration),
      {
        EX: this.agentTTL
      }
    );

    // Publish update event
    await this.client.publish(
      this.discoveryChannel,
      JSON.stringify({
        type: 'update',
        agent: registration
      })
    );
  }

  async findAgents(query: {
    role?: string;
    capabilities?: string[];
    status?: AgentInfo['status'];
  }): Promise<AgentInfo[]> {
    // Get all agent keys
    const keys = await this.client.keys(`${this.agentPrefix}*`);
    
    // Get agent data
    const agents = await Promise.all(
      keys.map(async key => {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) as AgentRegistration : null;
      })
    );

    // Filter agents based on query
    return agents.filter((agent): agent is AgentRegistration => {
      if (!agent) return false;
      
      if (query.role && agent.role !== query.role) {
        return false;
      }

      if (query.capabilities && !query.capabilities.every(cap => 
        agent.capabilities.includes(cap)
      )) {
        return false;
      }

      if (query.status && agent.status !== query.status) {
        return false;
      }

      return true;
    });
  }

  async watchAgents(
    handler: (event: { type: 'add' | 'remove' | 'update'; agent: AgentInfo }) => void
  ): Promise<void> {
    this.watchers.add(handler);
  }

  private startHeartbeat(agentId: string): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(async () => {
      try {
        const key = `${this.agentPrefix}${agentId}`;
        const data = await this.client.get(key);
        if (data) {
          const registration = JSON.parse(data) as AgentRegistration;
          registration.lastHeartbeat = new Date();
          
          await this.client.set(
            key,
            JSON.stringify(registration),
            {
              EX: this.agentTTL
            }
          );
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error sending heartbeat:', error.message);
        }
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private async startCleanup(): Promise<void> {
    // Run cleanup every minute
    this.cleanupTimer = setInterval(async () => {
      try {
        const keys = await this.client.keys(`${this.agentPrefix}*`);
        const now = Date.now();

        await Promise.all(
          keys.map(async key => {
            const data = await this.client.get(key);
            if (data) {
              const registration = JSON.parse(data) as AgentRegistration;
              const lastHeartbeat = new Date(registration.lastHeartbeat).getTime();

              // Remove agents that haven't sent a heartbeat in 2 minutes
              if (now - lastHeartbeat > 120000) {
                await this.unregisterAgent(registration.id);
              }
            }
          })
        );
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error in cleanup job:', error.message);
        }
      }
    }, 60000);
  }
}
