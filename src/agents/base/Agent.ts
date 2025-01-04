import { Backplane } from '../../backplane/base.js';
import { Tool } from '../../tools/base.js';
import { ClaudeClient } from '../../claude/client.js';
import { promises as fs } from 'fs';
import { logger } from '../../logging/base.js';
import { LogComponent } from '../../logging/types.js';
import { RoleDefinition, validateRole } from '../../roles/types.js';

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
  private roleDefinition: RoleDefinition | null = null;
  private isInitialized: boolean = false;

  constructor(config: AgentConfig) {
    this.rolePath = config.rolePath;
    this.tools = config.tools;
    this.claude = config.claude;
    this.backplane = config.backplane;
  }

  async init(config: AgentConfig): Promise<void> {
    try {
      if (!this.isInitialized) {
        logger.info(LogComponent.AGENT, `Initializing agent with role from ${this.rolePath}`);
        
        // Load role definition
        const roleContent = await fs.readFile(this.rolePath, 'utf-8');
        const parsedRole = JSON.parse(roleContent);
        
        // Validate role definition
        const errors = validateRole(parsedRole);
        if (errors.length > 0) {
          const errorMessage = `Invalid role definition: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`;
          logger.error(LogComponent.AGENT, errorMessage);
          throw new Error(errorMessage);
        }

        this.roleDefinition = parsedRole as RoleDefinition;
        this.isInitialized = true;

        logger.info(LogComponent.AGENT, 'Agent initialized successfully', {
          role: this.roleDefinition.name,
          toolCount: this.tools.length
        });
      }
    } catch (error) {
      logger.error(LogComponent.AGENT, 'Failed to initialize agent', {
        error: error instanceof Error ? error.message : 'Unknown error',
        rolePath: this.rolePath
      });
      throw error;
    }
  }

  async execute(task: { goal: string; task: string; data: any }): Promise<{ success: boolean; result: any }> {
    if (!this.isInitialized || !this.roleDefinition) {
      const error = new Error('Agent not initialized. Call init() first.');
      logger.error(LogComponent.AGENT, 'Attempted to execute task before initialization');
      throw error;
    }

    logger.info(LogComponent.AGENT, 'Executing task', {
      goal: task.goal,
      task: task.task,
      role: this.roleDefinition.name
    });

    // Create prompt based on role and task
    const prompt = `
You are a ${this.roleDefinition.name}.
${this.roleDefinition.description}

Your responsibilities include:
${this.roleDefinition.responsibilities.join('\n')}

Your capabilities:
${Object.entries(this.roleDefinition.capabilities)
  .map(([name, desc]) => `- ${name}: ${desc}`)
  .join('\n')}

Available tools:
${Object.entries(this.roleDefinition.tools)
  .map(([name, desc]) => `- ${name}: ${desc}`)
  .join('\n')}

Instructions for your role:
${this.roleDefinition.instructions.join('\n')}

Your current task:
Goal: ${task.goal}
Task: ${task.task}
Data: ${JSON.stringify(task.data, null, 2)}

Please provide your response based on your role, capabilities, and available tools.
`;

    try {
      logger.debug(LogComponent.AGENT, 'Sending prompt to Claude', {
        promptLength: prompt.length,
        role: this.roleDefinition.name
      });

      const response = await this.claude.complete(prompt);
      
      logger.info(LogComponent.AGENT, 'Task executed successfully', {
        goal: task.goal,
        responseLength: response.length
      });

      return {
        success: true,
        result: response
      };
    } catch (error) {
      logger.error(LogComponent.AGENT, 'Error executing task', {
        error: error instanceof Error ? error.message : 'Unknown error',
        goal: task.goal,
        task: task.task
      });

      return {
        success: false,
        result: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
