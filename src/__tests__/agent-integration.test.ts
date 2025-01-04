import { config } from 'dotenv';
import { Agent } from '../agents/base/Agent.js';
import { Backplane, BackplaneConfig } from '../backplane/base.js';
import { RedisBackplaneFactory } from '../backplane/redis/index.js';
import { ClaudeClient } from '../claude/client.js';
import { Memory } from '../agents/base/Memory.js';
import { RoleLoader } from '../roles/loader.js';

// Load environment variables
config();

// Increase Jest timeout for all tests
jest.setTimeout(30000);

describe('Agent Integration Tests', () => {
  let backplane: Backplane;
  let claude: ClaudeClient;
  let memory: Memory;
  let roleLoader: RoleLoader;
  let backplaneConfig: BackplaneConfig;
  let backplaneFactory: RedisBackplaneFactory;

  beforeAll(async () => {
    console.log('Setting up test environment...');
    
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('CLAUDE_API_KEY environment variable is required');
    }
    
    claude = new ClaudeClient({ apiKey });
    console.log('Claude client initialized');
    
    backplaneConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      prefix: 'test:',
      pubsub: {
        messageChannel: 'test:messages',
        contextChannel: 'test:context',
        discoveryChannel: 'test:discovery'
      }
    };

    backplaneFactory = new RedisBackplaneFactory();
    backplane = backplaneFactory.createBackplane(backplaneConfig);
    await backplane.connect(backplaneConfig);
    console.log('Connected to Redis backplane');

    // Initialize memory system
    memory = new Memory({
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
    console.log('Memory system initialized');

    // Initialize role loader
    roleLoader = new RoleLoader();
    console.log('Role loader initialized');
  });

  afterAll(async () => {
    console.log('Cleaning up test environment...');
    try {
      await backplane.cleanup();
      console.log('Cleaned up Redis backplane');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  it('should execute coder agent tasks', async () => {
    console.log('Starting coder agent test...');
    const coder = new Agent({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    await coder.init({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    const result = await coder.execute({
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

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
    console.log('Completed coder agent test');
  });

  it('should execute project manager tasks', async () => {
    console.log('Starting project manager test...');
    const manager = new Agent({
      rolePath: 'src/roles/project-manager.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    await manager.init({
      rolePath: 'src/roles/project-manager.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    const result = await manager.execute({
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

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
    console.log('Completed project manager test');
  });

  it('should maintain role-specific behavior', async () => {
    console.log('Starting role behavior test...');
    const coder = new Agent({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    const manager = new Agent({
      rolePath: 'src/roles/project-manager.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    await coder.init({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    await manager.init({
      rolePath: 'src/roles/project-manager.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    const task = {
      goal: 'Implement new feature',
      task: 'Add user profile page',
      data: {
        requirements: 'Create a user profile page with basic info and avatar'
      }
    };

    const coderResult = await coder.execute(task);
    const managerResult = await manager.execute(task);

    expect(coderResult.success).toBe(true);
    expect(managerResult.success).toBe(true);
    expect(coderResult.result).not.toEqual(managerResult.result);
    console.log('Completed role behavior test');
  });

  it('should use memory for context', async () => {
    console.log('Starting memory context test...');
    const coder = new Agent({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    await coder.init({
      rolePath: 'src/roles/coder.json',
      tools: [],
      claude,
      backplane,
      memory,
      roleLoader
    });

    // First task establishes context
    const task1 = {
      goal: 'Setup project',
      task: 'Initialize React project structure',
      data: {
        requirements: 'Create a new React project with TypeScript and testing setup'
      }
    };

    // Second task should reference context from first task
    const task2 = {
      goal: 'Add feature',
      task: 'Implement user authentication',
      data: {
        requirements: 'Add user authentication to the React project'
      }
    };

    const result1 = await coder.execute(task1);
    const result2 = await coder.execute(task2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result2.result).toContain('React');
    console.log('Completed memory context test');
  });
});
