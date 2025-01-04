import { Agent } from '../../src/agents/base/Agent.js';
import { RedisBackplaneFactory } from '../../src/backplane/redis/index.js';
import { ClaudeClient } from '../../src/claude/client.js';
import { RoleLoader } from '../../src/roles/loader.js';
import { config } from 'dotenv';
import { Memory } from '../../src/agents/base/Memory.js';
import path from 'path';

// Load environment variables
config();

async function createAgent(config: {
  rolePath: string;
  claude: ClaudeClient;
  backplane: any;
  memory: Memory;
  roleLoader: RoleLoader;
}) {
  const agent = new Agent({
    rolePath: config.rolePath,
    tools: [],
    claude: config.claude,
    backplane: config.backplane,
    memory: config.memory,
    roleLoader: config.roleLoader
  });

  await agent.init({
    rolePath: config.rolePath,
    tools: [],
    claude: config.claude,
    backplane: config.backplane,
    memory: config.memory,
    roleLoader: config.roleLoader
  });

  return agent;
}

async function main() {
  // Initialize Claude client
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY environment variable is required');
  }
  const claude = new ClaudeClient({ apiKey });

  // Initialize backplane
  const backplaneFactory = new RedisBackplaneFactory();
  const backplane = backplaneFactory.createBackplane({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    prefix: 'demo:',
    pubsub: {
      messageChannel: 'demo:messages',
      contextChannel: 'demo:context',
      discoveryChannel: 'demo:discovery'
    }
  });

  await backplane.connect({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  });

  // Initialize shared components
  const memory = new Memory({
    shortTermLimit: 100,
    summarizeInterval: '1h',
    pruneThreshold: 0.5,
    claude,
    vectorStore: {
      dimensions: 1536,
      similarity: 'cosine',
      backend: 'memory'
    }
  });
  await memory.initialize();

  const roleLoader = new RoleLoader();

  // Create agents with different roles
  const agents = await Promise.all([
    createAgent({
      rolePath: path.resolve(__dirname, '../../src/roles/coder.json'),
      claude,
      backplane,
      memory,
      roleLoader
    }),
    createAgent({
      rolePath: path.resolve(__dirname, '../../src/roles/project-manager.json'),
      claude,
      backplane,
      memory,
      roleLoader
    })
  ]);

  const [coder, manager] = agents;

  // Example tasks demonstrating role-specific behaviors
  const tasks = [
    {
      agent: coder,
      goal: 'Analyze code quality',
      task: 'Review code for potential improvements',
      data: {
        code: `
function calculateTotal(items) {
  let total = 0;
  for(let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}
        `
      }
    },
    {
      agent: manager,
      goal: 'Plan new feature development',
      task: 'Create task breakdown',
      data: {
        feature: `
Add user authentication:
- Login/logout functionality
- Password reset
- Email verification
- Session management
        `
      }
    },
    {
      agent: coder,
      goal: 'Implement feature',
      task: 'Write authentication service',
      data: {
        requirements: `
Create an authentication service with:
1. User login/logout
2. Password hashing
3. JWT token generation
4. Session management
        `
      }
    },
    {
      agent: manager,
      goal: 'Track implementation progress',
      task: 'Review and update project status',
      data: {
        completedTasks: [
          'User login/logout API',
          'Password hashing implementation'
        ],
        pendingTasks: [
          'JWT token generation',
          'Session management',
          'Integration tests'
        ]
      }
    }
  ];

  // Execute tasks and demonstrate role-specific behaviors
  console.log('\nExecuting tasks with role-based agents:\n');

  for (const task of tasks) {
    console.log(`\n${task.agent.constructor.name} executing task:`);
    console.log('Goal:', task.goal);
    console.log('Task:', task.task);
    
    const result = await task.agent.execute({
      goal: task.goal,
      task: task.task,
      data: task.data
    });

    console.log('\nResult:', result.success ? 'Success' : 'Failed');
    console.log('Response:', result.result);
    console.log('\n---');
  }

  // Get metrics to show role-specific performance
  const metrics = agents.map(agent => ({
    role: agent.constructor.name,
    metrics: agent.getMetricsSummary()
  }));

  console.log('\nAgent Metrics:\n');
  metrics.forEach(({ role, metrics }) => {
    console.log(`${role}:`);
    console.log('Tasks completed:', metrics.overall.totalTasks);
    console.log('Average tokens:', metrics.overall.averageTotalTokens);
    console.log('Average duration:', metrics.overall.averageDuration);
    console.log();
  });

  // Clean up
  await backplane.cleanup();
}

main().catch(console.error);
