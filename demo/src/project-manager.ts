import { AxAgent, AxAI, AxAIService, AxChatResponse } from '@ax-llm/ax';
import { Tools } from './tools.js';

export interface ProjectPlan {
  name: string;
  description: string;
  tasks: {
    id: string;
    description: string;
    dependencies?: string[];
    status: 'pending' | 'in-progress' | 'completed';
  }[];
}

type ProjectManagerInput = Record<symbol, never> & {
  projectRequirements?: string;
  taskUpdate?: string;
  requestNextTask?: string;
};

type ProjectManagerOutput = Record<symbol, never> & {
  projectPlan?: string;
  updateStatus?: string;
  nextTask?: string;
};

export class ProjectManagerAgent extends AxAgent<ProjectManagerInput, ProjectManagerOutput> {
  private tools: Tools;
  private currentPlan: ProjectPlan | null = null;
  private aiService: AxAIService;

  constructor(tools: Tools, ai: AxAIService) {
    super({
      ai,
      name: 'Technical Project Manager',
      description: 'A technical project manager that breaks down requirements into tasks and coordinates with developers to ensure successful project completion',
      signature: `
        projectRequirements "requirements to analyze" -> projectPlan "generated project plan"
        taskUpdate "task update details" -> updateStatus "update success status"
        requestNextTask "request next task" -> nextTask "next available task"
      `
    });
    this.tools = tools;
    this.aiService = ai;
  }

  async createPlan(requirements: string): Promise<ProjectPlan> {
    const prompt = `
You are a technical project manager. Analyze these requirements and create a project plan:

${requirements}

Respond with a project plan in this EXACT format - do not deviate or add any other text:

{
  "name": "Todo API Project",
  "description": "A TypeScript-based Todo API with Express.js",
  "tasks": [
    {
      "id": "setup-project",
      "description": "Initialize project with TypeScript and Express.js configuration",
      "dependencies": []
    },
    {
      "id": "implement-todo-model",
      "description": "Create Todo data model and interfaces",
      "dependencies": ["setup-project"]
    }
  ]
}

IMPORTANT:
1. Use ONLY valid JSON syntax
2. Use double quotes for ALL strings
3. Use [] for empty arrays
4. Include ALL required fields
5. Make task IDs short and descriptive
6. List ALL dependencies accurately
7. Do NOT include any text before or after the JSON`;

    const result = await this.forward(this.aiService, {
      projectRequirements: requirements
    });

    if (!result.projectPlan) {
      throw new Error('Failed to generate project plan');
    }

    try {
      // Try to extract JSON from the response
      const planText = result.projectPlan || '';
      const jsonStart = planText.indexOf('{');
      const jsonEnd = planText.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error('No JSON object found in response');
      }

      const jsonStr = planText.slice(jsonStart, jsonEnd);
      const plan = JSON.parse(jsonStr) as ProjectPlan;

      // Validate the plan structure
      if (!plan.name || !plan.description || !Array.isArray(plan.tasks)) {
        throw new Error('Invalid plan structure');
      }

      // Validate each task
      plan.tasks = plan.tasks.map(task => {
        if (!task.id || !task.description) {
          throw new Error(`Invalid task structure: ${JSON.stringify(task)}`);
        }
        return {
          ...task,
          status: 'pending',
          dependencies: task.dependencies || []
        };
      });

      this.currentPlan = plan;
      return plan;
    } catch (error) {
      console.error('Raw plan:', result.projectPlan);
      throw new Error(`Failed to parse project plan: ${error}`);
    }
  }

  async updateTaskStatus(taskId: string, status: 'pending' | 'in-progress' | 'completed'): Promise<boolean> {
    const result = await this.forward(this.aiService, {
      taskUpdate: `${taskId}:${status}`
    });

    if (result.updateStatus === 'true' && this.currentPlan) {
      const task = this.currentPlan.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
      }
    }

    return result.updateStatus === 'true';
  }

  async getNextTask(): Promise<ProjectPlan['tasks'][0] | null> {
    const result = await this.forward(this.aiService, {
      requestNextTask: 'next'
    });

    if (!result.nextTask) return null;
    
    try {
      return JSON.parse(result.nextTask) as ProjectPlan['tasks'][0];
    } catch {
      return null;
    }
  }

  async isPlanComplete(): Promise<boolean> {
    if (!this.currentPlan) return false;
    return this.currentPlan.tasks.every(task => task.status === 'completed');
  }
}
