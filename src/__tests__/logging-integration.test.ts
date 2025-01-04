import { BaseLogger, logger } from '../logging/base.js';
import { LogLevel, LogComponent } from '../logging/types.js';
import { Agent } from '../agents/base/Agent.js';
import { ClaudeClient } from '../claude/client.js';
import { RedisBackplane } from '../backplane/redis/index.js';
import path from 'path';

declare global {
  var logger: BaseLogger;
}

// Mock redis
jest.mock('redis');

// Mock Claude client
jest.mock('../claude/client.js', () => {
  const { ClaudeClient } = jest.requireActual('../__mocks__/claude-client.js');
  return { ClaudeClient };
});

describe('Logging System Integration', () => {
  let testLogger: BaseLogger;
  let agent: Agent;
  let claude: ClaudeClient;
  let backplane: RedisBackplane;
  let originalLogger: BaseLogger;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Store original logger
    originalLogger = global.logger;
    
    // Create and set up logger
    testLogger = new BaseLogger();
    testLogger.setMinLevel(LogLevel.DEBUG);
    testLogger.clearEntries(); // Clear any existing entries
    
    // Replace the global logger
    global.logger = testLogger;

    // Wait for next tick to ensure logger is properly set
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (backplane) {
      await backplane.cleanup();
    }
    
    // Restore original logger
    global.logger = originalLogger;
    testLogger.clearEntries(); // Clear entries after each test
  });

  test('logs Claude client initialization', async () => {
    // Create a new client to trigger initialization logs
    claude = new ClaudeClient({
      apiKey: 'test-key',
      model: 'test-model'
    });

    // Wait for logs to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get logs before any cleanup
    const logs = testLogger.getEntries();
    const claudeLogs = logs.filter(log => log.component === LogComponent.CLAUDE);

    expect(claudeLogs.length).toBeGreaterThan(0);
    const initLog = claudeLogs.find(log => log.message.includes('Initialized Claude client'));
    expect(initLog).toBeDefined();
    expect(initLog?.level).toBe(LogLevel.INFO);
    expect(initLog?.metadata).toMatchObject({
      model: 'test-model'
    });
  });

  test('logs agent initialization and task execution', async () => {
    // Initialize components
    claude = new ClaudeClient({
      apiKey: 'test-key',
      model: 'test-model'
    });

    backplane = new RedisBackplane({
      host: 'localhost',
      port: 6379,
      prefix: 'test',
      pubsub: {
        messageChannel: 'test-messages',
        contextChannel: 'test-context',
        discoveryChannel: 'test-discovery'
      }
    });

    await backplane.connect({ host: 'localhost', port: 6379 });

    agent = new Agent({
      rolePath: path.join(process.cwd(), 'src/__mocks__/roles/coder.json'),
      tools: [],
      claude,
      backplane
    });

    await agent.init({
      rolePath: path.join(process.cwd(), 'src/__mocks__/roles/coder.json'),
      tools: [],
      claude,
      backplane
    });

    const task = {
      goal: 'Test goal',
      task: 'Test task',
      data: { key: 'value' }
    };

    await agent.execute(task);

    // Wait for logs to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get logs before any cleanup
    const logs = testLogger.getEntries();
    const agentLogs = logs.filter(log => log.component === LogComponent.AGENT);

    expect(agentLogs.length).toBeGreaterThan(1);
    expect(agentLogs.some(log => log.message.includes('Initializing agent'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Agent initialized successfully'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Executing task'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Task executed successfully'))).toBe(true);
  });

  test('logs backplane operations', async () => {
    // Initialize backplane
    backplane = new RedisBackplane({
      host: 'localhost',
      port: 6379,
      prefix: 'test',
      pubsub: {
        messageChannel: 'test-messages',
        contextChannel: 'test-context',
        discoveryChannel: 'test-discovery'
      }
    });

    await backplane.connect({ host: 'localhost', port: 6379 });

    // Perform operations
    await backplane.sendMessage('test-agent', { type: 'TEST', content: 'test' });
    await backplane.broadcastMessage({ type: 'BROADCAST', content: 'test' });

    // Wait for logs to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get logs before any cleanup
    const logs = testLogger.getEntries();
    const backplaneLogs = logs.filter(log => log.component === LogComponent.BACKPLANE);

    expect(backplaneLogs.length).toBeGreaterThan(2);
    expect(backplaneLogs.some(log => log.message.includes('Message sent successfully'))).toBe(true);
    expect(backplaneLogs.some(log => log.message.includes('Message broadcast successfully'))).toBe(true);
  });

  test('logs with different levels are filtered correctly', () => {
    testLogger.setMinLevel(LogLevel.WARN);

    testLogger.debug(LogComponent.AGENT, 'Debug message');
    testLogger.info(LogComponent.AGENT, 'Info message');
    testLogger.warn(LogComponent.AGENT, 'Warning message');
    testLogger.error(LogComponent.AGENT, 'Error message');

    const logs = testLogger.getEntries();
    expect(logs).toHaveLength(2); // Only WARN and ERROR should be captured
    expect(logs.every(log => log.level >= LogLevel.WARN)).toBe(true);
  });

  test('logs include correct metadata', async () => {
    const metadata = { key: 'value', number: 42 };
    testLogger.info(LogComponent.AGENT, 'Test message', metadata);

    const logs = testLogger.getEntries();
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject(metadata);
  });
});
