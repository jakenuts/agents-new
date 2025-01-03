import { Agent, AgentConfig, BaseAgentInput, BaseAgentOutput } from './base/Agent.js';
import type { Tool } from '../tools/base.js';
import type { ProjectManager } from './ProjectManager.js';

interface TaskAssignment {
  requirements: string[];
  deliverables: string[];
  testCriteria: string[];
  notes: string;
}

interface FileOperation {
  type: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
}

interface CoderInput extends BaseAgentInput {
  taskAssignment?: {
    taskId: string;
    description: string;
    assignment: string;
  };
  codeReview?: {
    code: string;
    feedback: string;
  };
  runTests?: {
    criteria: string[];
  };
}

interface CoderOutput extends BaseAgentOutput {
  implementation?: {
    code: string;
    files: { path: string; content: string }[];
  };
  testResults?: {
    success: boolean;
    error?: string;
    details?: unknown;
  };
  fixedCode?: {
    code: string;
    changes: string[];
  };
}

function isValidTaskAssignment(assignment: unknown): assignment is TaskAssignment {
  if (!assignment || typeof assignment !== 'object') return false;

  const a = assignment as Record<string, unknown>;

  return (
    Array.isArray(a.requirements) &&
    a.requirements.every(r => typeof r === 'string') &&
    Array.isArray(a.deliverables) &&
    a.deliverables.every(d => typeof d === 'string') &&
    Array.isArray(a.testCriteria) &&
    a.testCriteria.every(t => typeof t === 'string') &&
    typeof a.notes === 'string'
  );
}

export class Coder extends Agent<CoderInput, CoderOutput> {
  private projectManager: ProjectManager | null = null;
  private currentTask: { id: string; assignment: TaskAssignment } | null = null;

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: `Software Engineer responsible for:
1. Implementing assigned tasks according to specifications
2. Writing clean, maintainable, and efficient code
3. Following best practices and coding standards
4. Testing and debugging implementations
5. Documenting code and implementation decisions
6. Collaborating with the project manager`
    });
  }

  setProjectManager(manager: ProjectManager): void {
    this.projectManager = manager;
  }

  async handleTask(taskId: string, description: string, assignmentJson: string): Promise<void> {
    const assignment = JSON.parse(assignmentJson);
    if (!isValidTaskAssignment(assignment)) {
      throw new Error('Invalid task assignment format');
    }

    this.currentTask = { id: taskId, assignment };

    // 1. Analyze task and plan implementation
    const implementationPlan = await this.planImplementation(description, assignment);

    // 2. Execute the implementation plan
    const result = await this.implementTask(implementationPlan);

    // 3. Test the implementation
    const testResult = await this.testImplementation(assignment.testCriteria);

    if (!testResult.success) {
      if (this.projectManager) {
        await this.projectManager.updateTaskStatus(taskId, 'blocked', {
          error: testResult.error,
          details: testResult.details
        });
      }
      return;
    }

    // 4. Submit for review
    if (this.projectManager) {
      const review = await this.projectManager.reviewCode(result.code);
      
      if (!review.approved) {
        // Fix issues and resubmit
        const fixedResult = await this.fixCodeIssues(result.code, review.feedback);
        await this.projectManager.updateTaskStatus(taskId, 'completed', fixedResult);
      } else {
        await this.projectManager.updateTaskStatus(taskId, 'completed', result);
      }
    }

    this.currentTask = null;
  }

  private async planImplementation(description: string, assignment: TaskAssignment): Promise<FileOperation[]> {
    const prompt = `
Plan the implementation for this task:

Description: ${description}

Requirements:
${assignment.requirements.map(r => `- ${r}`).join('\n')}

Deliverables:
${assignment.deliverables.map(d => `- ${d}`).join('\n')}

Additional Notes:
${assignment.notes}

Create a detailed implementation plan that:
1. Lists all files that need to be created or modified
2. Describes the changes needed for each file
3. Considers code organization and structure
4. Follows best practices and patterns
5. Includes error handling and edge cases

Return plan as JSON array of file operations:
[{
  "type": "create|update|delete",
  "path": "string - file path",
  "content": "string - file content (for create/update)"
}]`;

    const response = await this.claude.complete(prompt);
    const operations = JSON.parse(response) as FileOperation[];

    // Validate operations
    if (!Array.isArray(operations) || !operations.every(op => 
      typeof op === 'object' &&
      op !== null &&
      ['create', 'update', 'delete'].includes(op.type) &&
      typeof op.path === 'string' &&
      (op.type === 'delete' || typeof op.content === 'string')
    )) {
      throw new Error('Invalid implementation plan format');
    }

    return operations;
  }

  private async implementTask(operations: FileOperation[]): Promise<{ code: string }> {
    const implementedFiles: Record<string, string> = {};

    for (const op of operations) {
      switch (op.type) {
        case 'create':
        case 'update':
          if (!op.content) continue;
          
          const tool = this.tools.find(t => t.name === 'write_to_file');
          if (tool) {
            await tool.execute({
              path: op.path,
              content: op.content
            });
            implementedFiles[op.path] = op.content;
          }
          break;

        case 'delete':
          const deleteTool = this.tools.find(t => t.name === 'execute_command');
          if (deleteTool) {
            await deleteTool.execute({
              command: `rm ${op.path}`,
              requires_approval: true
            });
          }
          break;
      }
    }

    // Return all implemented code as a single string for review
    return {
      code: Object.entries(implementedFiles)
        .map(([path, content]) => `// ${path}\n\n${content}`)
        .join('\n\n')
    };
  }

  private async testImplementation(criteria: string[]): Promise<{ 
    success: boolean;
    error?: string;
    details?: unknown;
  }> {
    const prompt = `
Test the implementation against these criteria:

${criteria.map(c => `- ${c}`).join('\n')}

For each criterion:
1. Design specific test cases
2. Consider edge cases and error conditions
3. Verify expected behavior
4. Check for potential issues

Return test results as JSON:
{
  "success": boolean,
  "error": "string - error message if failed",
  "details": {
    "passedTests": ["string[] - descriptions"],
    "failedTests": [{
      "description": "string",
      "error": "string",
      "suggestion": "string"
    }]
  }
}`;

    const response = await this.claude.complete(prompt);
    return JSON.parse(response);
  }

  private async fixCodeIssues(code: string, feedback: string): Promise<{ code: string }> {
    const prompt = `
Fix these issues in the code:

${code}

Feedback:
${feedback}

Return only the fixed code.`;

    const fixedCode = await this.claude.complete(prompt);
    return { code: fixedCode };
  }

  override async execute(input: CoderInput): Promise<CoderOutput> {
    if (input.taskAssignment) {
      await this.handleTask(
        input.taskAssignment.taskId,
        input.taskAssignment.description,
        input.taskAssignment.assignment
      );
      return {
        success: true,
        result: {
          implementation: {
            code: this.currentTask?.assignment.notes || '',
            files: []
          }
        }
      };
    }

    if (input.codeReview) {
      const fixedCode = await this.fixCodeIssues(
        input.codeReview.code,
        input.codeReview.feedback
      );
      return {
        success: true,
        result: {
          fixedCode: {
            code: fixedCode.code,
            changes: ['Applied review feedback']
          }
        }
      };
    }

    if (input.runTests) {
      const testResults = await this.testImplementation(input.runTests.criteria);
      return {
        success: testResults.success,
        result: { testResults }
      };
    }

    return await super.execute(input);
  }
}
