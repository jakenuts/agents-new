import { AgentMessage } from '../agents/base/Agent.js';
import {
  Backplane,
  BackplaneConfig,
  MessageBroker,
  ContextManager,
  DiscoveryService,
  AgentInfo,
  MessageEnvelope,
  ContextSyncEvent
} from './types.js';

export abstract class BaseBackplane implements Backplane {
  protected config!: BackplaneConfig; // Initialized in connect()
  protected connected: boolean = false;

  abstract messageBroker: MessageBroker;
  abstract contextManager: ContextManager;
  abstract discoveryService: DiscoveryService;

  async connect(config: BackplaneConfig): Promise<void> {
    if (this.connected) {
      throw new Error('Backplane already connected');
    }

    this.config = config;
    
    try {
      // Connect all services
      await this.messageBroker.connect(config);
      await this.initializeServices();
      this.connected = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.messageBroker.disconnect();
    } finally {
      this.connected = false;
    }
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    this.ensureConnected();

    const envelope: MessageEnvelope = {
      id: this.generateId(),
      timestamp: new Date(),
      message,
      routing: {
        source: message.metadata.sender,
        target: message.metadata.sender, // Set in metadata
        priority: message.metadata.priority
      },
      metadata: {}
    };

    await this.messageBroker.publish(envelope);
  }

  async broadcastMessage(
    message: AgentMessage,
    filter?: (agent: AgentInfo) => boolean
  ): Promise<void> {
    this.ensureConnected();

    // Find all active agents
    const agents = await this.discoveryService.findAgents({
      status: 'active'
    });

    // Apply filter if provided
    const targets = filter ? agents.filter(filter) : agents;

    // Send message to each target
    await Promise.all(
      targets.map(agent => {
        const envelope: MessageEnvelope = {
          id: this.generateId(),
          timestamp: new Date(),
          message,
          routing: {
            source: message.metadata.sender,
            target: agent.id,
            priority: message.metadata.priority
          },
          metadata: {}
        };

        return this.messageBroker.publish(envelope);
      })
    );
  }

  async shareContext(contextId: string, targetAgentId: string): Promise<void> {
    this.ensureConnected();

    // Create a new context branch for the target agent
    const branchId = await this.contextManager.createContextBranch(
      contextId,
      targetAgentId
    );

    // Get the shared context
    const context = await this.contextManager.getSharedContext(contextId);

    // Sync the context to the target agent
    const syncEvent: ContextSyncEvent = {
      type: 'update',
      agentId: targetAgentId,
      contextId: branchId,
      nodes: context,
      timestamp: new Date(),
      metadata: {}
    };

    await this.contextManager.syncContext(syncEvent);
  }

  async findCollaborators(requirements: {
    role?: string;
    capabilities?: string[];
  }): Promise<AgentInfo[]> {
    this.ensureConnected();
    return this.discoveryService.findAgents({
      ...requirements,
      status: 'active'
    });
  }

  protected abstract initializeServices(): Promise<void>;

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Backplane not connected');
    }
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
