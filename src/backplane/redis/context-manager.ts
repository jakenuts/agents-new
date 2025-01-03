import { RedisClientType } from 'redis';
import { ContextManager, ContextSyncEvent } from '../types.js';
import { ContextNode } from '../../agents/base/Context.js';

interface ContextBranch {
  id: string;
  sourceId: string;
  targetId: string;
  nodes: ContextNode[];
  createdAt: Date;
  lastSync: Date;
}

export class RedisContextManager implements ContextManager {
  private readonly contextChannel: string;
  private readonly contextPrefix: string;
  private readonly branchPrefix: string;

  constructor(
    private readonly client: RedisClientType,
    private readonly prefix: string,
    channel?: string
  ) {
    this.contextChannel = channel || `${prefix}context`;
    this.contextPrefix = `${prefix}context:`;
    this.branchPrefix = `${prefix}branch:`;
  }

  async initialize(): Promise<void> {
    // Subscribe to context sync events
    const subscriber = this.client.duplicate();
    await subscriber.connect();

    await subscriber.subscribe(this.contextChannel, async (message) => {
      try {
        const event = JSON.parse(message) as ContextSyncEvent;
        await this.handleSyncEvent(event);
      } catch (error) {
        console.error('Error processing context sync event:', error);
      }
    });
  }

  async syncContext(event: ContextSyncEvent): Promise<void> {
    // Store context nodes
    const contextKey = `${this.contextPrefix}${event.contextId}`;
    await this.client.set(
      contextKey,
      JSON.stringify(event.nodes),
      {
        EX: 86400 * 7 // 7 day TTL
      }
    );

    // Publish sync event
    await this.client.publish(
      this.contextChannel,
      JSON.stringify(event)
    );

    // Update branch if this is a branched context
    const branchKey = `${this.branchPrefix}${event.contextId}`;
    const branchData = await this.client.get(branchKey);
    if (branchData) {
      const branch: ContextBranch = JSON.parse(branchData);
      branch.lastSync = new Date();
      branch.nodes = event.nodes;
      await this.client.set(branchKey, JSON.stringify(branch));
    }
  }

  async getSharedContext(contextId: string): Promise<ContextNode[]> {
    const contextKey = `${this.contextPrefix}${contextId}`;
    const data = await this.client.get(contextKey);
    return data ? JSON.parse(data) : [];
  }

  async createContextBranch(sourceId: string, targetId: string): Promise<string> {
    // Get source context
    const sourceContext = await this.getSharedContext(sourceId);
    
    // Create new branch ID
    const branchId = `${sourceId}-${targetId}-${Date.now()}`;
    
    // Create branch record
    const branch: ContextBranch = {
      id: branchId,
      sourceId,
      targetId,
      nodes: sourceContext,
      createdAt: new Date(),
      lastSync: new Date()
    };

    // Store branch
    const branchKey = `${this.branchPrefix}${branchId}`;
    await this.client.set(branchKey, JSON.stringify(branch));

    return branchId;
  }

  async mergeContextBranch(sourceId: string, targetId: string): Promise<void> {
    // Get branch data
    const branchPattern = `${this.branchPrefix}${sourceId}-${targetId}-*`;
    const branchKeys = await this.client.keys(branchPattern);
    
    if (branchKeys.length === 0) {
      throw new Error(`No branch found for source ${sourceId} and target ${targetId}`);
    }

    // Get most recent branch
    const branchKey = branchKeys[branchKeys.length - 1];
    const branchData = await this.client.get(branchKey);
    if (!branchData) {
      throw new Error(`Branch data not found for key ${branchKey}`);
    }

    const branch: ContextBranch = JSON.parse(branchData);

    // Merge branch nodes into target context
    await this.syncContext({
      type: 'update',
      agentId: targetId,
      contextId: targetId,
      nodes: branch.nodes,
      timestamp: new Date(),
      metadata: {
        mergedFrom: sourceId,
        branchId: branch.id
      }
    });

    // Clean up branch
    await this.client.del(branchKey);
  }

  private async handleSyncEvent(event: ContextSyncEvent): Promise<void> {
    switch (event.type) {
      case 'update':
        // Already handled in syncContext
        break;

      case 'delete':
        // Delete context
        const contextKey = `${this.contextPrefix}${event.contextId}`;
        await this.client.del(contextKey);

        // Delete associated branches
        const branchPattern = `${this.branchPrefix}*${event.contextId}*`;
        const branchKeys = await this.client.keys(branchPattern);
        if (branchKeys.length > 0) {
          await this.client.del(branchKeys);
        }
        break;

      case 'prune':
        // Get current context
        const nodes = await this.getSharedContext(event.contextId);
        
        // Apply pruning (implement pruning logic here)
        const prunedNodes = nodes; // TODO: Implement actual pruning

        // Update context with pruned nodes
        await this.syncContext({
          ...event,
          type: 'update',
          nodes: prunedNodes
        });
        break;
    }
  }
}
