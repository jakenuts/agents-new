import { AxAgent, AxAIService, AxChatResponse } from '@ax-llm/ax';
import { Tools } from './tools.js';
import { ProjectPlan } from './project-manager.js';

type CoderInput = Record<symbol, never> & {
  taskDetails?: string;
  codeToReview?: string;
  testRequirements?: string;
};

type CoderOutput = Record<symbol, never> & {
  codeFiles?: string;
  reviewFeedback?: string;
  testCode?: string;
};

export class CoderAgent extends AxAgent<CoderInput, CoderOutput> {
  private tools: Tools;
  private aiService: AxAIService;

  constructor(tools: Tools, ai: AxAIService) {
    super({
      ai,
      name: 'TypeScript Developer',
      description: 'An expert TypeScript developer that implements features, reviews code, and writes tests following best practices',
      signature: `
        taskDetails "task to implement" -> codeFiles "generated implementation"
        codeToReview "code to analyze" -> reviewFeedback "code review comments"
        testRequirements "implementation to test" -> testCode "generated tests"
      `
    });
    this.tools = tools;
    this.aiService = ai;
  }

  private createSystemPrompt(action: string): string {
    return `You are a TypeScript expert who communicates only in valid JSON. You MUST:
1. Respond ONLY with valid JSON
2. Use double quotes for all strings
3. Format arrays with square brackets
4. Never include comments or explanations
5. Start response with { and end with }
6. Follow TypeScript best practices in generated code`;
  }

  async implementTask(task: ProjectPlan['tasks'][0], currentFiles?: { path: string; content: string }[]): Promise<{
    success: boolean;
    message: string;
    files?: { path: string; content: string }[];
  }> {
    const input = JSON.stringify({
      task,
      currentFiles,
      systemPrompt: this.createSystemPrompt('implementation'),
      format: {
        type: "json",
        schema: {
          success: "boolean - whether implementation was successful",
          message: "string - description of what was implemented",
          files: [
            {
              path: "string - relative path to the file",
              content: "string - complete file content"
            }
          ]
        }
      }
    });

    const result = await this.forward(this.aiService, {
      taskDetails: input
    });

    try {
      if (!result.codeFiles) {
        throw new Error('No implementation returned');
      }
      const implementation = JSON.parse(result.codeFiles);
      if (!implementation.success || !implementation.message) {
        throw new Error('Invalid implementation format');
      }
      return implementation;
    } catch (error) {
      console.error('Raw implementation:', result.codeFiles);
      return {
        success: false,
        message: `Failed to parse implementation: ${error}`
      };
    }
  }

  async reviewCode(code: string, path: string): Promise<string> {
    const input = JSON.stringify({
      code,
      path,
      systemPrompt: this.createSystemPrompt('code review'),
      format: {
        type: "json",
        schema: {
          review: "string - detailed code review feedback"
        }
      }
    });

    const result = await this.forward(this.aiService, {
      codeToReview: input
    });

    try {
      if (!result.reviewFeedback) {
        throw new Error('No review returned');
      }
      const review = JSON.parse(result.reviewFeedback);
      return review.review || 'Failed to generate code review';
    } catch {
      return 'Failed to parse code review';
    }
  }

  async writeTests(implementation: string, requirements: string): Promise<string> {
    const input = JSON.stringify({
      implementation,
      requirements,
      systemPrompt: this.createSystemPrompt('test generation'),
      format: {
        type: "json",
        schema: {
          tests: "string - complete test file content"
        }
      }
    });

    const result = await this.forward(this.aiService, {
      testRequirements: input
    });

    try {
      if (!result.testCode) {
        throw new Error('No tests returned');
      }
      const tests = JSON.parse(result.testCode);
      return tests.tests || 'Failed to generate tests';
    } catch {
      return 'Failed to parse test generation result';
    }
  }
}
