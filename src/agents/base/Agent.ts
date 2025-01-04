import { Backplane } from '../../backplane/base.js';
import { Tool } from '../../tools/base.js';
import { ClaudeClient } from '../../claude/client.js';
import { promises as fs } from 'fs';

export interface AgentConfig {
  rolePath: string;
  tools: Tool[];
  claude: ClaudeClient;
  backplane: Pick<Backplane, 
    'connect' | 
    'disconnect' | 
    'cleanup' | 
    'getDiscoveryService' | 
    'sendMessage' | 
    'broadcastMessage' | 
    'shareContext' | 
    'findCollaborators'
  >;
}

export interface AgentMessage {
  type: string;
  content: any;
  metadata?: Record<string, any>;
}

export class Agent {
  private readonly rolePath: string;
  private readonly tools: Tool[];
  private readonly claude: ClaudeClient;
  private readonly backplane: AgentConfig['backplane'];
  private roleDefinition: any;
  private isInitialized: boolean = false;

  constructor(config: AgentConfig) {
    this.rolePath = config.rolePath;
    this.tools = config.tools;
    this.claude = config.claude;
    this.backplane = config.backplane;
  }

  async init(config: AgentConfig): Promise<void> {
    if (!this.isInitialized) {
      // Load role definition
      const roleContent = await fs.readFile(this.rolePath, 'utf-8');
      this.roleDefinition = JSON.parse(roleContent);
      this.isInitialized = true;
    }
  }

  async execute(task: { goal: string; task: string; data: any }): Promise<{ success: boolean; result: any }> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized. Call init() first.');
    }

    // Create prompt based on role and task
    const prompt = `
You are a ${this.roleDefinition.name}.
${this.roleDefinition.description}

Your responsibilities include:
${this.roleDefinition.responsibilities.join('\n')}

Your current task:
Goal: ${task.goal}
Task: ${task.task}
Data: ${JSON.stringify(task.data, null, 2)}

Please provide your response based on your role and capabilities.
`;

    try {
      const response = await this.claude.complete(prompt);
      return {
        success: true,
        result: response
      };
    } catch (error) {
      console.error('Error executing task:', error);
      return {
        success: false,
        result: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
