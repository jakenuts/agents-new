import { AgentMessage } from '../agents/base/Agent.js';
import { ContextNode } from '../agents/base/Context.js';

export interface BackplaneConfig {
  host: string;
  port: number;
  secure?: boolean;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface AgentInfo {
  id: string;
  role: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'offline';
  lastSeen: Date;
  metadata: Record<string, unknown>;
}

export interface MessageEnvelope {
  id: string;
  timestamp: Date;
  message: AgentMessage;
  routing: {
    source: string;
    target: string;
    channel?: string;
    priority: number;
  };
  metadata: {
    contextId?: string;
    correlationId?: string;
    ttl?: number;
    retries?: number;
  };
}

export interface ContextSyncEvent {
  type: 'update' | 'delete' | 'prune';
  agentId: string;
  contextId: string;
  nodes: ContextNode[];
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface MessageBroker {
  connect(config: BackplaneConfig): Promise<void>;
  disconnect(): Promise<void>;
  publish(message: MessageEnvelope): Promise<void>;
  subscribe(pattern: string, handler: (message: MessageEnvelope) => Promise<void>): Promise<void>;
  unsubscribe(pattern: string): Promise<void>;
}

export interface ContextManager {
  syncContext(event: ContextSyncEvent): Promise<void>;
  getSharedContext(contextId: string): Promise<ContextNode[]>;
  createContextBranch(sourceId: string, targetId: string): Promise<string>;
  mergeContextBranch(sourceId: string, targetId: string): Promise<void>;
}

export interface DiscoveryService {
  registerAgent(info: AgentInfo): Promise<void>;
  unregisterAgent(id: string): Promise<void>;
  updateAgentStatus(id: string, status: AgentInfo['status']): Promise<void>;
  findAgents(query: {
    role?: string;
    capabilities?: string[];
    status?: AgentInfo['status'];
  }): Promise<AgentInfo[]>;
  watchAgents(handler: (event: { type: 'add' | 'remove' | 'update'; agent: AgentInfo }) => void): Promise<void>;
}

export interface Backplane {
  messageBroker: MessageBroker;
  contextManager: ContextManager;
  discoveryService: DiscoveryService;
  
  connect(config: BackplaneConfig): Promise<void>;
  disconnect(): Promise<void>;
  
  // Convenience methods that combine underlying services
  sendMessage(message: AgentMessage): Promise<void>;
  broadcastMessage(message: AgentMessage, filter?: (agent: AgentInfo) => boolean): Promise<void>;
  shareContext(contextId: string, targetAgentId: string): Promise<void>;
  findCollaborators(requirements: { role?: string; capabilities?: string[] }): Promise<AgentInfo[]>;
}
