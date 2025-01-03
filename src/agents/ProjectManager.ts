import { Agent, AgentConfig, AgentMessage, BaseAgentInput, BaseAgentOutput } from './base/Agent.js';
import type { Tool } from '../tools/base.js';
import type { Memory } from './base/Memory.js';

interface ProjectPlan {
  name: string;
  description: string;
  tasks: {
    id: string;
    description: string;
    dependencies: string[];
    assignedTo?: string;
    status: 'pending' | 'in-progress' | 'completed' | 'blocked';
    priority: 'high' | 'medium' | 'low';
  }[];
}

interface ProjectManagerInput extends BaseAgentInput {
  requirements?: string;
  taskUpdate?: {
    taskId: string;
    status: ProjectPlan['tasks'][0]['status'];
    result?: unknown;
  };
  codeReview?: {
    code: string;
  };
}

interface ProjectManagerOutput extends BaseAgentOutput {
  plan?: ProjectPlan;
  taskStatus?: {
    taskId: string;
    status: ProjectPlan['tasks'][0]['status'];
  };
  review?: {
    approved: boolean;
    feedback: string;
  };
}

function isValidProjectPlan(plan: unknown): plan is ProjectPlan {
  if (!plan || typeof plan !== 'object') return false;

  const p = plan as Record<string, unknown>;
  
  if (typeof p.name !== 'string' || typeof p.description !== 'string') {
    return false;
  }

  if (!Array.isArray(p.tasks)) return false;

  return p.tasks.every(task => {
    if (!task || typeof task !== 'object') return false;
    const t = task as Record<string, unknown>;

    return (
      typeof t.id === 'string' &&
      typeof t.description === 'string' &&
      Array.isArray(t.dependencies) &&
      t.dependencies.every(d => typeof d === 'string') &&
      (!t.assignedTo || typeof t.assignedTo === 'string') &&
      typeof t.status === 'string' &&
      ['pending', 'in-progress', 'completed', 'blocked'].includes(t.status) &&
      typeof t.priority === 'string' &&
      ['high', 'medium', 'low'].includes(t.priority)
    );
  });
}

export class ProjectManager extends Agent<ProjectManagerInput, ProjectManagerOutput> {
  private currentPlan: ProjectPlan | null = null;
  private teamMembers: Map<string, Agent> = new Map();

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: `Project Manager responsible for:
1. Breaking down project requirements into clear, actionable tasks
2. Prioritizing tasks and managing dependencies
3. Assigning tasks to team members based on their capabilities
4. Monitoring progress and adjusting plans as needed
5. Ensuring project goals are met efficiently
6. Maintaining clear communication between team members`
    });
  }

  async createProject(requirements: string): Promise<ProjectPlan> {
    const prompt = `
As a project manager, create a detailed plan for this project:

${requirements}

Break it down into specific tasks, considering:
1. Dependencies between tasks
2. Logical ordering of implementation
3. Technical requirements and constraints
4. Risk management and potential blockers

Return the plan in this JSON format:
{
  "name": "string - project name",
  "description": "string - brief project overview",
  "tasks": [{
    "id": "string - unique task identifier",
    "description": "string - detailed task description",
    "dependencies": ["string[] - IDs of tasks this depends on"],
    "status": "pending",
    "priority": "high | medium | low"
  }]
}`;

    const response = await this.claude.complete(prompt);
    const parsed = JSON.parse(response);
    
    if (!isValidProjectPlan(parsed)) {
      throw new Error('Invalid project plan format received from Claude');
    }

    this.currentPlan = parsed;
    return parsed;
  }

  async assignTasks(coder: Agent): Promise<void> {
    if (!this.currentPlan) {
      throw new Error('No active project plan');
    }

    this.teamMembers.set('coder', coder);

    // Find unassigned tasks that have no pending dependencies
    const unassignedTasks = this.currentPlan.tasks.filter(task => {
      if (task.assignedTo || task.status !== 'pending') {
        return false;
      }

      // Check if all dependencies are completed
      const deps = task.dependencies.map(id => 
        this.currentPlan!.tasks.find(t => t.id === id)
      );
      return deps.every(d => d?.status === 'completed');
    });

    // Assign tasks to the coder
    for (const task of unassignedTasks) {
      task.assignedTo = 'coder';
      task.status = 'in-progress';

      const prompt = `
Assign this task to the coder:

${task.description}

Consider:
1. Technical requirements
2. Dependencies and constraints
3. Expected deliverables
4. Quality criteria
5. Testing requirements

Return assignment details in JSON format:
{
  "requirements": ["string[] - specific technical requirements"],
  "deliverables": ["string[] - expected outputs"],
  "testCriteria": ["string[] - testing requirements"],
  "notes": "string - additional implementation notes"
}`;

      const response = await this.claude.complete(prompt);
      const assignment = JSON.parse(response);

      const message: AgentMessage = {
        type: 'request',
        content: {
          type: 'task_assignment',
          taskId: task.id,
          details: assignment
        },
        metadata: {
          sender: this.getId(),
          priority: 1,
          requiresResponse: true
        }
      };

      await this.sendMessage(coder, message);
    }
  }

  async updateTaskStatus(taskId: string, status: ProjectPlan['tasks'][0]['status'], result?: unknown): Promise<void> {
    if (!this.currentPlan) {
      throw new Error('No active project plan');
    }

    const task = this.currentPlan.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = status;

    if (result) {
      await this.think(`Task ${taskId} completed with result: ${JSON.stringify(result, null, 2)}`);
    }

    // Check if we can assign new tasks
    if (status === 'completed') {
      const coder = this.teamMembers.get('coder');
      if (coder) {
        await this.assignTasks(coder);
      }
    }
  }

  async reviewCode(code: string): Promise<{ approved: boolean; feedback: string }> {
    const prompt = `
Review this code implementation:

${code}

Consider:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Security implications
5. Maintainability and readability

Return review in JSON format:
{
  "approved": boolean,
  "feedback": "string - detailed feedback with specific suggestions if not approved"
}`;

    const response = await this.claude.complete(prompt);
    const review = JSON.parse(response);

    if (
      typeof review === 'object' &&
      review !== null &&
      typeof review.approved === 'boolean' &&
      typeof review.feedback === 'string'
    ) {
      return review as { approved: boolean; feedback: string };
    }

    throw new Error('Invalid code review format received from Claude');
  }

  override async execute(input: ProjectManagerInput): Promise<ProjectManagerOutput> {
    if (input.requirements) {
      const plan = await this.createProject(input.requirements);
      return {
        success: true,
        result: { plan }
      };
    }

    if (input.taskUpdate) {
      await this.updateTaskStatus(
        input.taskUpdate.taskId,
        input.taskUpdate.status,
        input.taskUpdate.result
      );
      return {
        success: true,
        result: {
          taskStatus: {
            taskId: input.taskUpdate.taskId,
            status: input.taskUpdate.status
          }
        }
      };
    }

    if (input.codeReview) {
      const review = await this.reviewCode(input.codeReview.code);
      return {
        success: true,
        result: { review }
      };
    }

    return await super.execute(input);
  }
}
