import { ClaudeClient } from '../../claude/client.js';
import { Context } from './Context.js';
import { Memory, MemoryConfig } from './Memory.js';
import { Tool } from '../../tools/base.js';
import { LoadedRole, RoleContext } from '../../roles/types.js';
import { RoleLoader } from '../../roles/loader.js';
import { Backplane } from '../../backplane/types.js';

export interface AgentConfig {
  rolePath: string;  // Path to role definition file
  tools: Tool[];
  claude: ClaudeClient;
  backplane: Backplane;
  contextLimit?: number;
  memoryConfig?: Omit<MemoryConfig, 'claude'>;
}

export interface AgentState {
  currentGoal?: string;
  activeTask?: string;
  status: 'idle' | 'thinking' | 'executing' | 'error';
  error?: string;
}

export interface AgentMessage {
  type: 'request' | 'response' | 'update' | 'error';
  content: unknown;
  metadata: {
    sender: string;
    priority: number;
    requiresResponse: boolean;
    deadline?: Date;
  };
}

export interface AgentAction {
  type: 'use_tool' | 'think' | 'communicate';
  tool?: string;
  params?: unknown;
  thought?: string;
  message?: AgentMessage;
  rationale: string;
  priority: number;
}

export interface AgentAnalysis {
  currentGoal: string;
  subgoals: string[];
  progress: {
    completed: string[];
    inProgress: string[];
    blocked: { task: string; reason: string }[];
  };
  decisions: {
    decision: string;
    rationale: string;
    impact: string;
    confidence: number;
  }[];
  nextSteps: {
    action: string;
    priority: number;
    dependencies: string[];
  }[];
  context: {
    relevantMemories: string[];
    importantContext: string[];
    uncertainties: string[];
  };
}

// Default input/output types for base Agent
export interface BaseAgentInput {
  goal?: string;
  task?: string;
  data?: unknown;
}

export interface BaseAgentOutput {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class Agent<
  TInput extends BaseAgentInput = BaseAgentInput,
  TOutput extends BaseAgentOutput = BaseAgentOutput
> {
  protected role: LoadedRole;
  protected roleLoader: RoleLoader;
  protected tools: Tool[];
  protected claude: ClaudeClient;
  protected context: Context;
  protected memory: Memory;
  protected state: AgentState;
  protected backplane: Backplane;

  constructor(config: AgentConfig) {
    this.backplane = config.backplane;
    this.roleLoader = new RoleLoader();
    this.tools = config.tools;
    this.claude = config.claude;
    this.state = {
      status: 'idle'
    };

    // Initialize context and memory systems
    this.context = new Context({
      maxTokens: config.contextLimit || 100000,
      claude: this.claude
    });

    this.memory = new Memory({
      shortTermLimit: config.memoryConfig?.shortTermLimit ?? 1000,
      summarizeInterval: config.memoryConfig?.summarizeInterval ?? '1h',
      pruneThreshold: config.memoryConfig?.pruneThreshold ?? 0.5,
      claude: this.claude
    });

    // Initialize role as a placeholder until init() is called
    this.role = {
      definition: {
        name: 'Initializing...',
        description: 'Agent is initializing...',
        responsibilities: [],
        capabilities: {},
        tools: {},
        instructions: []
      },
      context: {
        state: {},
        collaborators: new Map()
      }
    };
  }

  async init(config: AgentConfig): Promise<void> {
    // Load role definition
    this.role = await this.roleLoader.loadRole(config.rolePath);

    // Register agent with backplane
    await this.backplane.discoveryService.registerAgent({
      id: this.getId(),
      role: this.role.definition.name,
      capabilities: Object.keys(this.role.definition.capabilities),
      status: 'active',
      lastSeen: new Date(),
      metadata: {
        tools: Object.keys(this.role.definition.tools)
      }
    });

    // Subscribe to messages
    await this.backplane.messageBroker.subscribe(this.getId(), async (envelope) => {
      await this.handleMessage(envelope.message);
    });

    // Initialize context
    await this.context.initialize();
  }

  async execute(input: TInput): Promise<TOutput> {
    try {
      this.state.status = 'thinking';

      // Process input using role-based decision making
      const analysis = await this.analyzeContext();
      this.state.currentGoal = analysis.currentGoal;

      // Decide next action based on role capabilities and instructions
      const action = await this.decideNextAction(analysis);

      // Execute action
      this.state.status = 'executing';
      const result = await this.executeAction(action);

      // Update context with result
      await this.updateContext(result);

      // Maintain context/memory
      await this.maintain();

      // Check if goal is completed
      if (await this.isGoalCompleted(analysis)) {
        await this.onGoalCompleted(analysis.currentGoal);
      }

      this.state.status = 'idle';
      return {
        success: true,
        result
      } as TOutput;
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: this.state.error
      } as TOutput;
    }
  }

  private async executeBase(input: TInput): Promise<TOutput> {
    // 1. Process any pending messages
    await this.processMessages();

    // 2. Analyze current context
    const analysis = await this.analyzeContext();
    
    // 3. Update state with current goal
    this.state.currentGoal = analysis.currentGoal;

    // 4. Decide next action
    const action = await this.decideNextAction(analysis);

    // 5. Execute action
    this.state.status = 'executing';
    const result = await this.executeAction(action);

    // 6. Update context with result
    await this.updateContext(result);

    // 7. Maintain context/memory
    await this.maintain();

    // 8. Check if goal is completed
    if (await this.isGoalCompleted(analysis)) {
      await this.onGoalCompleted(analysis.currentGoal);
    }

    this.state.status = 'idle';
    return {
      success: true,
      result
    } as TOutput;
  }

  async collaborate(agentId: string): Promise<void> {
    // Find agent info
    const agents = await this.backplane.findCollaborators({
      role: this.role.definition.name
    });
    
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Share context
    const contextId = await this.context.getId();
    await this.backplane.shareContext(contextId, agentId);

    await this.context.add({
      type: 'communication',
      content: `Started collaboration with ${agent.role}`,
      timestamp: new Date()
    });
  }

  async sendMessage(message: Omit<AgentMessage, 'metadata'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      metadata: {
        sender: this.getId(),
        priority: 1,
        requiresResponse: message.type === 'request'
      }
    };

    await this.backplane.sendMessage(fullMessage);
    await this.context.add({
      type: 'communication',
      content: `Sent ${message.type}: ${JSON.stringify(message.content)}`,
      timestamp: new Date()
    });
  }

  protected async processMessages(): Promise<void> {
    // Message processing handled by backplane subscriptions
    // Set up in initialize()
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    const prompt = `
As an AI agent with these capabilities:
${JSON.stringify(this.role.definition.capabilities, null, 2)}

Following these instructions:
${this.role.definition.instructions.map(i => `- ${i}`).join('\n')}

Handle this incoming message:
${JSON.stringify(message, null, 2)}

Decide how to respond. Consider:
1. Message priority and deadline
2. Whether a response is required
3. How it relates to current goals
4. What action to take

Respond in JSON format:
{
  "action": {
    "type": "respond | update_context | ignore",
    "response": {
      "type": "response | error",
      "content": "response content if needed"
    },
    "rationale": "explanation of decision"
  }
}`;

    const response = await this.claude.complete(prompt);
    const decision = JSON.parse(response);

    if (decision.action.type === 'respond') {
      await this.sendMessage({
        type: 'response',
        content: decision.action.response.content
      });
    }

    await this.context.add({
      type: 'thought',
      content: `Handled message: ${decision.action.rationale}`,
      timestamp: new Date()
    });
  }

  protected async analyzeContext(): Promise<AgentAnalysis> {
    const prompt = `
As an AI agent with these capabilities:
${JSON.stringify(this.role.definition.capabilities, null, 2)}

Following these instructions:
${this.role.definition.instructions.map(i => `- ${i}`).join('\n')}

Analyze the current context:
${await this.context.getSummary()}

And relevant memories:
${await this.getRelevantMemories()}

Provide detailed analysis in this JSON format:
{
  "currentGoal": "string - active goal being pursued",
  "subgoals": ["string[] - list of pending subgoals"],
  "progress": {
    "completed": ["string[] - completed items"],
    "inProgress": ["string[] - items being worked on"],
    "blocked": [{"task": "string", "reason": "string"}]
  },
  "decisions": [{
    "decision": "string - what was decided",
    "rationale": "string - why it was decided",
    "impact": "string - expected impact",
    "confidence": "number - confidence level 0-1"
  }],
  "nextSteps": [{
    "action": "string - recommended action",
    "priority": "number - importance 0-1",
    "dependencies": ["string[] - required items"]
  }],
  "context": {
    "relevantMemories": ["string[] - key remembered items"],
    "importantContext": ["string[] - critical current context"],
    "uncertainties": ["string[] - unclear or risky items"]
  }
}`;

    const response = await this.claude.complete(prompt);
    return JSON.parse(response);
  }

  protected async decideNextAction(analysis: AgentAnalysis): Promise<AgentAction> {
    const prompt = `
As an AI agent with these capabilities:
${JSON.stringify(this.role.definition.capabilities, null, 2)}

Following these instructions:
${this.role.definition.instructions.map(i => `- ${i}`).join('\n')}

Given this context analysis:
${JSON.stringify(analysis, null, 2)}

And these available tools:
${Object.entries(this.role.definition.tools).map(([name, desc]) => `- ${name}: ${desc}`).join('\n')}

Decide the next action to take. Consider:
1. Current goal and progress
2. Priority of next steps
3. Available tools and capabilities
4. Collaboration opportunities
5. Risks and uncertainties

Respond in this JSON format:
{
  "action": {
    "type": "use_tool | think | communicate",
    "tool": "string - tool name if using tool",
    "params": "object - parameters if using tool",
    "thought": "string - reasoning if thinking",
    "message": {
      "type": "request | update",
      "content": "message content"
    },
    "rationale": "string - detailed explanation",
    "priority": "number - importance 0-1"
  }
}`;

    const response = await this.claude.complete(prompt);
    return JSON.parse(response).action;
  }

  protected async executeAction(action: AgentAction): Promise<unknown> {
    switch (action.type) {
      case 'use_tool':
        return await this.executeTool(action.tool!, action.params);
      case 'think':
        return await this.think(action.thought!);
      case 'communicate':
        return await this.communicate(action.message!);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  protected async executeTool(toolName: string, params: unknown): Promise<unknown> {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    return await tool.execute(params);
  }

  protected async think(thought: string): Promise<unknown> {
    await this.context.add({
      type: 'thought',
      content: thought,
      timestamp: new Date()
    });
    return { type: 'thought', content: thought };
  }

  protected async communicate(message: AgentMessage): Promise<unknown> {
    await this.sendMessage(message);
    return { type: 'communication', message };
  }

  protected async updateContext(result: unknown): Promise<void> {
    await this.context.add({
      type: 'result',
      content: JSON.stringify(result),
      timestamp: new Date()
    });
  }

  protected async maintain(): Promise<void> {
    await this.context.optimize();
    await this.memory.optimize();
  }

  protected async getRelevantMemories(): Promise<string> {
    const memories = await this.memory.recall(this.state.currentGoal || '', {
      limit: 5,
      minRelevance: 0.7
    });

    return memories.map(m => m.content).join('\n\n');
  }

  protected async isGoalCompleted(analysis: AgentAnalysis): Promise<boolean> {
    return analysis.progress.completed.includes(analysis.currentGoal);
  }

  protected async onGoalCompleted(goal: string): Promise<void> {
    await this.memory.store({
      type: 'experience',
      content: `Completed goal: ${goal}`,
      timestamp: new Date()
    });

    // Broadcast completion to all relevant agents
    await this.backplane.broadcastMessage({
      type: 'update',
      content: { completedGoal: goal },
      metadata: {
        sender: this.getId(),
        priority: 1,
        requiresResponse: false
      }
    });
  }

  getId(): string {
    return this.constructor.name;
  }

  getRole(): string {
    return this.role.definition.name;
  }

  getRoleDefinition(): LoadedRole {
    return this.role;
  }

  async loadRole(path: string): Promise<void> {
    this.role = await this.roleLoader.loadRole(path);
  }

  async cleanup(): Promise<void> {
    try {
      // Unregister from discovery service
      await this.backplane.discoveryService.unregisterAgent(this.getId());

      // Unsubscribe from messages
      await this.backplane.messageBroker.unsubscribe(this.getId());

      // Update status before final cleanup
      await this.backplane.discoveryService.updateAgentStatus(this.getId(), 'offline');

      // Clean up context and memory
      await this.context.optimize();
      await this.memory.optimize();

      // Broadcast shutdown message
      await this.backplane.broadcastMessage({
        type: 'update',
        content: { agentShutdown: this.getId() },
        metadata: {
          sender: this.getId(),
          priority: 1,
          requiresResponse: false
        }
      });
    } catch (error) {
      console.error('Error during agent cleanup:', error);
      throw error;
    }
  }
}
