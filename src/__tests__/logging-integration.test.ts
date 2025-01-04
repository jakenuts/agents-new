import { BaseLogger, logger } from '../logging/base.js';
import { LogLevel, LogComponent } from '../logging/types.js';
import { Agent } from '../agents/base/Agent.js';
import { ClaudeClient } from '../claude/client.js';
import { RedisBackplane } from '../backplane/redis/index.js';
import path from 'path';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create and set up logger
    testLogger = new BaseLogger();
    testLogger.setMinLevel(LogLevel.DEBUG);
    
    // Replace the global logger
    const originalLogger = (global as any).logger;
    (global as any).logger = testLogger;
    (global as any).__originalLogger = originalLogger;

    // Wait for next tick to ensure logger is properly set
    await new Promise(resolve => setImmediate(resolve));
    
    // Initialize test components after logger is set up
    claude = new ClaudeClient({
      apiKey: 'test-key',
      model: 'test-model'
    });

    // Wait for next tick to ensure initialization logs are captured
    await new Promise(resolve => setImmediate(resolve));

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

    // Store original logger for cleanup
    (global as any).__originalLogger = originalLogger;
  });

  afterEach(async () => {
    // Cleanup Redis connections
    await backplane.cleanup();
    
    // Restore original logger
    (global as any).logger = (global as any).__originalLogger;
    delete (global as any).__originalLogger;
    
    testLogger.clearEntries();
    jest.clearAllMocks();
  });

  test('logs Claude client initialization', async () => {
    // Clear any existing logs
    testLogger.clearEntries();
    
    // Create a new client to trigger initialization logs
    const newClaude = new ClaudeClient({
      apiKey: 'test-key',
      model: 'test-model'
    });

    // Wait for next tick to ensure logs are processed
    await new Promise(resolve => setImmediate(resolve));

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
    // Clear any existing logs
    testLogger.clearEntries();
    
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

    // Wait for next tick to ensure logs are processed
    await new Promise(resolve => setImmediate(resolve));

    const logs = testLogger.getEntries();
    const agentLogs = logs.filter(log => log.component === LogComponent.AGENT);

    expect(agentLogs.length).toBeGreaterThan(1);
    expect(agentLogs.some(log => log.message.includes('Initializing agent'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Agent initialized successfully'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Executing task'))).toBe(true);
    expect(agentLogs.some(log => log.message.includes('Task executed successfully'))).toBe(true);
  });

  test('logs backplane operations', async () => {
    // Clear any existing logs
    testLogger.clearEntries();
    
    // Backplane is already connected in beforeEach
    await backplane.sendMessage('test-agent', { type: 'TEST', content: 'test' });
    await backplane.broadcastMessage({ type: 'BROADCAST', content: 'test' });

    // Wait for next tick to ensure logs are processed
    await new Promise(resolve => setImmediate(resolve));

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
