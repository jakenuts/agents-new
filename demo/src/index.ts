import { Agent } from '../../src/agents/base/Agent.js';
import { RedisBackplaneFactory } from '../../src/backplane/redis/index.js';
import { ClaudeClient } from '../../src/claude/client.js';
import { config } from 'dotenv';

// Load environment variables
config();

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

  // Create agents
  const coder = new Agent({
    rolePath: '../../src/roles/coder.json',
    tools: [],
    claude,
    backplane
  });

  const manager = new Agent({
    rolePath: '../../src/roles/project-manager.json',
    tools: [],
    claude,
    backplane
  });

  // Initialize agents
  await coder.init({
    rolePath: '../../src/roles/coder.json',
    tools: [],
    claude,
    backplane
  });

  await manager.init({
    rolePath: '../../src/roles/project-manager.json',
    tools: [],
    claude,
    backplane
  });

  // Execute tasks
  const coderResult = await coder.execute({
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
  });

  console.log('Coder result:', coderResult);

  const managerResult = await manager.execute({
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
  });

  console.log('Manager result:', managerResult);

  // Clean up backplane
  await backplane.cleanup();
}

main().catch(console.error);
