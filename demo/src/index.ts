import { ClaudeClient } from '@/claude/client.js';
import { ProjectManager } from '@/agents/ProjectManager.js';
import { Coder } from '@/agents/Coder.js';
import { BaseTool } from '@/tools/base.js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WriteFileTool extends BaseTool {
  name = 'write_to_file';
  description = 'Write content to a file at the specified path';
  parameters = [
    {
      name: 'path',
      type: 'string',
      description: 'File path relative to the project root',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true
    }
  ];
  requiresApproval = true;

  async executeImpl({ path, content }: { path: string; content: string }) {
    // Implementation would use the actual tool system
    console.log(`Writing to ${path}:`);
    console.log(content);
    return { success: true };
  }
}

class ExecuteCommandTool extends BaseTool {
  name = 'execute_command';
  description = 'Execute a shell command';
  parameters = [
    {
      name: 'command',
      type: 'string',
      description: 'Command to execute',
      required: true
    },
    {
      name: 'requires_approval',
      type: 'boolean',
      description: 'Whether the command requires user approval',
      required: true
    }
  ];
  requiresApproval = true;

  async executeImpl({ command }: { command: string; requires_approval: boolean }) {
    console.log(`Executing: ${command}`);
    return { success: true };
  }
}

async function main() {
  // Initialize Claude client
  const claude = new ClaudeClient({
    apiKey: process.env.CLAUDE_API_KEY || ''
  });

  // Initialize tools
  const tools = [
    new WriteFileTool(),
    new ExecuteCommandTool()
  ];

  // Create agents
  const projectManager = new ProjectManager({
    claude,
    tools,
    contextLimit: 100000,
    role: 'Project Manager'
  });

  const coder = new Coder({
    claude,
    tools,
    contextLimit: 100000,
    role: 'Software Engineer'
  });

  // Connect agents
  coder.setProjectManager(projectManager);

  // Load project requirements
  const requirements = readFileSync(
    join(__dirname, '../requirements.md'),
    'utf-8'
  );

  console.log('Creating project plan...');
  const plan = await projectManager.createProject(requirements);
  console.log('Project plan:', JSON.stringify(plan, null, 2));

  // Start assigning tasks
  console.log('\nAssigning initial tasks...');
  await projectManager.assignTasks(coder);

  // The agents will now work together through the task pipeline:
  // 1. Project manager assigns tasks
  // 2. Coder implements tasks
  // 3. Project manager reviews code
  // 4. Coder fixes any issues
  // 5. Project manager assigns next tasks
  // This continues until all tasks are completed
}

main().catch(console.error);
