import { Agent } from '../../src/agents/base/Agent.js';
import { RedisBackplane } from '../../src/backplane/redis/index.js';
import { ClaudeClient } from '../../src/claude/client.js';
import { Tool } from '../../src/tools/base.js';

// Initialize backplane
const backplane = new RedisBackplane({
  host: 'localhost',
  port: 6379,
  prefix: 'demo:',
  pubsub: {
    messageChannel: 'demo:messages',
    contextChannel: 'demo:context',
    discoveryChannel: 'demo:discovery'
  }
});

// Initialize Claude client
const claude = new ClaudeClient({
  apiKey: process.env.CLAUDE_API_KEY!
});

// Define available tools
const tools: Tool[] = [
  {
    name: 'write_to_file',
    description: 'Write content to a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to write the file to'
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write to the file'
      }
    ],
    requiresApproval: true,
    execute: async (params: unknown) => {
      const { path, content } = params as { path: string; content: string };
      const startTime = new Date();
      // Implementation would go here
      const endTime = new Date();
      return {
        success: true,
        output: `Wrote to ${path}`,
        metadata: {
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          resourcesUsed: [path],
          dependencies: []
        }
      };
    }
  },
  {
    name: 'read_file',
    description: 'Read content from a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to read the file from'
      }
    ],
    requiresApproval: false,
    execute: async (params: unknown) => {
      const { path } = params as { path: string };
      const startTime = new Date();
      // Implementation would go here
      const endTime = new Date();
      return {
        success: true,
        output: `Content from ${path}`,
        metadata: {
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          resourcesUsed: [path],
          dependencies: []
        }
      };
    }
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command',
    parameters: [
      {
        name: 'command',
        type: 'string',
        description: 'Command to execute'
      }
    ],
    requiresApproval: true,
    execute: async (params: unknown) => {
      const { command } = params as { command: string };
      const startTime = new Date();
      // Implementation would go here
      const endTime = new Date();
      return {
        success: true,
        output: `Executed: ${command}`,
        metadata: {
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          resourcesUsed: [],
          dependencies: []
        }
      };
    }
  }
];

async function main() {
  try {
    // Connect backplane
    await backplane.connect({
      host: 'localhost',
      port: 6379
    });

    // Create agents with different roles
    const coder = new Agent({
      rolePath: 'src/roles/coder.json',
      tools,
      claude,
      backplane
    });

    const projectManager = new Agent({
      rolePath: 'src/roles/project-manager.json',
      tools,
      claude,
      backplane
    });

    // Initialize agents
    await Promise.all([
      coder.init({
        rolePath: 'src/roles/coder.json',
        tools,
        claude,
        backplane
      }),
      projectManager.init({
        rolePath: 'src/roles/project-manager.json',
        tools,
        claude,
        backplane
      })
    ]);

    // Example: Project manager creates a project and assigns tasks
    const result = await projectManager.execute({
      goal: 'Create a new web application',
      task: 'Plan project and assign initial tasks',
      data: {
        requirements: `
Create a simple todo list application with:
- Add/edit/delete tasks
- Mark tasks as complete
- Filter by status
- Store in localStorage
- Responsive design`
      }
    });

    console.log('Project planning result:', result);

    // Clean up
    await Promise.all([
      coder.cleanup(),
      projectManager.cleanup()
    ]);

    await backplane.disconnect();
  } catch (error) {
    console.error('Error in demo:', error);
    process.exit(1);
  }
}

// Run demo
main().catch(console.error);
