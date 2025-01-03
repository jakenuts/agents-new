import { ClaudeClient } from '../../claude/client.js';
import { Context } from './Context.js';
import { Memory, MemoryConfig } from './Memory.js';
import { Tool } from '../../tools/base.js';

export interface AgentConfig {
  role: string;
  tools: Tool[];
  claude: ClaudeClient;
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
  protected role: string;
  protected tools: Tool[];
  protected claude: ClaudeClient;
  protected context: Context;
  protected memory: Memory;
  protected state: AgentState;
  protected messageQueue: AgentMessage[] = [];
  protected collaborators: Map<string, Agent> = new Map();

  constructor(config: AgentConfig) {
    this.role = config.role;
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
  }

  async execute(input: TInput): Promise<TOutput> {
    try {
      this.state.status = 'thinking';

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
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: this.state.error
      } as TOutput;
    }
  }

  async collaborate(agent: Agent): Promise<void> {
    this.collaborators.set(agent.getId(), agent);
    await this.context.add({
      type: 'communication',
      content: `Started collaboration with ${agent.getRole()}`,
      timestamp: new Date()
    });
  }

  async sendMessage(to: Agent, message: Omit<AgentMessage, 'metadata'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      metadata: {
        sender: this.getId(),
        priority: 1,
        requiresResponse: message.type === 'request'
      }
    };

    await to.receiveMessage(fullMessage);
    await this.context.add({
      type: 'communication',
      content: `Sent ${message.type} to ${to.getRole()}: ${JSON.stringify(message.content)}`,
      timestamp: new Date()
    });
  }

  async receiveMessage(message: AgentMessage): Promise<void> {
    this.messageQueue.push(message);
    await this.context.add({
      type: 'communication',
      content: `Received ${message.type} from ${message.metadata.sender}: ${JSON.stringify(message.content)}`,
      timestamp: new Date()
    });
  }

  protected async processMessages(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (!message) continue;

      await this.handleMessage(message);
    }
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    const prompt = `
As an AI agent with this role:
${this.role}

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
      const sender = this.collaborators.get(message.metadata.sender);
      if (sender) {
        await this.sendMessage(sender, decision.action.response);
      }
    }

    await this.context.add({
      type: 'thought',
      content: `Handled message: ${decision.action.rationale}`,
      timestamp: new Date()
    });
  }

  protected async analyzeContext(): Promise<AgentAnalysis> {
    const prompt = `
As an AI agent with this role:
${this.role}

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
As an AI agent with this role:
${this.role}

Given this context analysis:
${JSON.stringify(analysis, null, 2)}

And these available tools:
${this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

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
    const recipient = this.collaborators.get(message.metadata.sender);
    if (!recipient) {
      throw new Error(`Unknown recipient: ${message.metadata.sender}`);
    }

    await this.sendMessage(recipient, message);
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

    for (const agent of this.collaborators.values()) {
      await this.sendMessage(agent, {
        type: 'update',
        content: { completedGoal: goal }
      });
    }
  }

  getId(): string {
    return this.constructor.name;
  }

  getRole(): string {
    return this.role;
  }
}
