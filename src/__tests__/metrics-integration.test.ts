import { metricsService } from '../metrics/service.js';
import { ClaudeClient } from '../claude/client.js';
import { Agent } from '../agents/base/Agent.js';
import { Backplane } from '../backplane/base.js';
import { RedisBackplane } from '../backplane/redis/index.js';
import { RoleLoader } from '../roles/loader.js';
import { Memory } from '../agents/base/Memory.js';
import { promises as fs } from 'fs';
import { MetricsSummary, ModelMetrics, AgentMetrics } from '../metrics/types.js';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockImplementation((path) => {
      if (path.includes('coder')) {
        return Promise.resolve(JSON.stringify({
          name: 'Software Engineer',
          description: 'Implements software features and writes code',
          responsibilities: ['Write code', 'Review code', 'Fix bugs'],
          capabilities: {
            coding: 'Can write and review code',
            debugging: 'Can identify and fix bugs'
          },
          tools: {},
          instructions: ['Write clean, maintainable code', 'Follow best practices']
        }));
      }
      return Promise.resolve(JSON.stringify({
        name: 'Project Manager',
        description: 'Manages projects and coordinates tasks',
        responsibilities: ['Plan projects', 'Track progress', 'Coordinate team'],
        capabilities: {
          planning: 'Can plan and organize projects',
          coordination: 'Can coordinate team members'
        },
        tools: {},
        instructions: ['Create clear project plans', 'Monitor progress effectively']
      }));
    })
  }
}));

jest.mock('../claude/client.js', () => ({
  ClaudeClient: jest.fn().mockImplementation(() => ({
    config: {},
    complete: jest.fn().mockImplementation(async (prompt) => {
      // Simulate response with metrics
      const responseLength = prompt.length * 0.5; // Simulate response being half the prompt length
      const inputTokens = Math.ceil(prompt.length / 4); // Simulate 4 chars per token
      const outputTokens = Math.ceil(responseLength / 4);
      
      return {
        content: 'Mocked response',
        metrics: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          contextLength: prompt.length,
          responseLength,
          duration: 100
        }
      };
    }),
    getMetricsSummary: jest.fn().mockReturnValue({
      byAgent: {
        'Software Engineer': {
          taskCount: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          contextLength: 1000,
          responseLength: 500,
          duration: 100
        },
        'Project Manager': {
          taskCount: 1,
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          contextLength: 2000,
          responseLength: 1000,
          duration: 200
        }
      },
      overall: {
        totalTasks: 2,
        averageInputTokens: 150,
        averageOutputTokens: 75,
        averageTotalTokens: 225,
        averageContextLength: 1500,
        averageResponseLength: 750,
        averageDuration: 150
      }
    })
  }))
}));

jest.mock('../backplane/redis/index.js', () => ({
  RedisBackplane: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockImplementation((config) => Promise.resolve()),
    disconnect: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
    getDiscoveryService: jest.fn().mockReturnValue({
      registerAgent: jest.fn(),
      findAgents: jest.fn().mockResolvedValue([])
    }),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    broadcastMessage: jest.fn().mockResolvedValue(undefined),
    shareContext: jest.fn().mockResolvedValue(undefined),
    findCollaborators: jest.fn().mockResolvedValue([])
  }))
}));

jest.mock('../agents/base/Memory.js', () => ({
  Memory: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue('test-id'),
    recall: jest.fn().mockResolvedValue([]),
    optimize: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../metrics/service.js', () => {
  const mockMetricsService = {
    recordModelUsage: jest.fn(),
    getMetricsSummary: jest.fn(),
    resetMetrics: jest.fn()
  };

  let metrics: MetricsSummary = {
    byAgent: {},
    overall: {
      totalTasks: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      averageTotalTokens: 0,
      averageContextLength: 0,
      averageResponseLength: 0,
      averageDuration: 0
    }
  };

  mockMetricsService.recordModelUsage.mockImplementation((role: string, data: ModelMetrics) => {
    if (!metrics.byAgent[role]) {
      metrics.byAgent[role] = {
        role,
        taskCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        contextLength: 0,
        responseLength: 0,
        duration: 0
      };
    }

    const agentMetrics = metrics.byAgent[role];
    agentMetrics.taskCount++;
    agentMetrics.inputTokens += data.inputTokens;
    agentMetrics.outputTokens += data.outputTokens;
    agentMetrics.totalTokens += data.totalTokens;
    agentMetrics.contextLength += data.contextLength;
    agentMetrics.responseLength += data.responseLength;
    agentMetrics.duration += data.duration;

    metrics.overall.totalTasks++;
    const totalAgents = Object.keys(metrics.byAgent).length;
    const agentMetricsArray = Object.values(metrics.byAgent);
    
    metrics.overall.averageInputTokens = agentMetricsArray.reduce((sum, m) => sum + m.inputTokens, 0) / totalAgents;
    metrics.overall.averageOutputTokens = agentMetricsArray.reduce((sum, m) => sum + m.outputTokens, 0) / totalAgents;
    metrics.overall.averageTotalTokens = agentMetricsArray.reduce((sum, m) => sum + m.totalTokens, 0) / totalAgents;
    metrics.overall.averageContextLength = agentMetricsArray.reduce((sum, m) => sum + m.contextLength, 0) / totalAgents;
    metrics.overall.averageResponseLength = agentMetricsArray.reduce((sum, m) => sum + m.responseLength, 0) / totalAgents;
    metrics.overall.averageDuration = agentMetricsArray.reduce((sum, m) => sum + m.duration, 0) / totalAgents;
  });

  mockMetricsService.getMetricsSummary.mockImplementation(() => metrics);

  mockMetricsService.resetMetrics.mockImplementation(() => {
    metrics = {
      byAgent: {},
      overall: {
        totalTasks: 0,
        averageInputTokens: 0,
        averageOutputTokens: 0,
        averageTotalTokens: 0,
        averageContextLength: 0,
        averageResponseLength: 0,
        averageDuration: 0
      }
    };
  });

  return { metricsService: mockMetricsService };
});

jest.mock('../roles/loader.js', () => ({
  RoleLoader: jest.fn().mockImplementation(() => ({
    loadRole: jest.fn().mockImplementation((path) => {
      const coderRole = {
        definition: {
          name: 'Software Engineer',
          description: 'Implements software features and writes code',
          responsibilities: ['Write code', 'Review code', 'Fix bugs'],
          capabilities: {
            coding: 'Can write and review code',
            debugging: 'Can identify and fix bugs'
          },
          tools: {},
          instructions: ['Write clean, maintainable code', 'Follow best practices']
        },
        context: {
          state: {},
          collaborators: new Map()
        }
      };

      const pmRole = {
        definition: {
          name: 'Project Manager',
          description: 'Manages projects and coordinates tasks',
          responsibilities: ['Plan projects', 'Track progress', 'Coordinate team'],
          capabilities: {
            planning: 'Can plan and organize projects',
            coordination: 'Can coordinate team members'
          },
          tools: {},
          instructions: ['Create clear project plans', 'Monitor progress effectively']
        },
        context: {
          state: {},
          collaborators: new Map()
        }
      };

      return Promise.resolve(path.includes('coder') ? coderRole : pmRole);
    })
  }))
}));

describe('Metrics Integration', () => {
  let backplane: Backplane;
  let coderAgent: Agent;
  let pmAgent: Agent;
  let roleLoader: RoleLoader;
  let memory: Memory;

  beforeEach(async () => {
    const backplaneConfig = {
      host: 'localhost',
      port: 6379,
      prefix: 'test',
      pubsub: {
        messageChannel: 'test-messages',
        contextChannel: 'test-context',
        discoveryChannel: 'test-discovery'
      }
    };

    backplane = new RedisBackplane(backplaneConfig);
    await backplane.connect(backplaneConfig);

    const claude = new ClaudeClient({ apiKey: 'test-key', model: 'test-model' });
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

    // Initialize role loader
    roleLoader = new RoleLoader();

    // Initialize agents with roles
    const coderConfig = {
      claude,
      backplane,
      rolePath: 'src/roles/coder.json',
      tools: [],
      roleLoader,
      memory
    };
    coderAgent = new Agent(coderConfig);
    await coderAgent.init(coderConfig);

    const pmConfig = {
      claude,
      backplane,
      rolePath: 'src/roles/project-manager.json',
      tools: [],
      roleLoader,
      memory
    };
    pmAgent = new Agent(pmConfig);
    await pmAgent.init(pmConfig);

    // Reset metrics before each test
    metricsService.resetMetrics();
  });

  afterEach(async () => {
    await backplane.cleanup();
    metricsService.resetMetrics();
    jest.clearAllMocks();
  });

  test('tracks metrics per role', async () => {
    // Execute tasks
    await coderAgent.execute({
      goal: 'Test code metrics',
      task: 'Write a test function',
      data: {}
    });

    await pmAgent.execute({
      goal: 'Test PM metrics',
      task: 'Create a task list',
      data: {}
    });

    const summary = metricsService.getMetricsSummary();

    // Verify agent-specific metrics
    expect(summary.byAgent).toHaveProperty('Software Engineer');
    expect(summary.byAgent).toHaveProperty('Project Manager');

    const coderMetrics = summary.byAgent['Software Engineer'];
    const pmMetrics = summary.byAgent['Project Manager'];

    expect(coderMetrics.taskCount).toBe(1);
    expect(pmMetrics.taskCount).toBe(1);

    expect(coderMetrics.inputTokens).toBeGreaterThan(0);
    expect(pmMetrics.inputTokens).toBeGreaterThan(0);

    // Verify overall metrics
    expect(summary.overall.totalTasks).toBe(2);
    expect(summary.overall.averageInputTokens).toBeGreaterThan(0);
    expect(summary.overall.averageOutputTokens).toBeGreaterThan(0);

    // Verify metrics were recorded with correct data
    expect(metricsService.recordModelUsage).toHaveBeenCalledTimes(2);
    expect(metricsService.recordModelUsage).toHaveBeenCalledWith('Software Engineer', expect.objectContaining({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      totalTokens: expect.any(Number),
      contextLength: expect.any(Number),
      responseLength: expect.any(Number),
      duration: expect.any(Number)
    }));
    expect(metricsService.recordModelUsage).toHaveBeenCalledWith('Project Manager', expect.objectContaining({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      totalTokens: expect.any(Number),
      contextLength: expect.any(Number),
      responseLength: expect.any(Number),
      duration: expect.any(Number)
    }));
  });

  test('resets metrics correctly', async () => {
    // Execute a task
    await coderAgent.execute({
      goal: 'Test metrics reset',
      task: 'Write a test function',
      data: {}
    });

    // Reset metrics
    metricsService.resetMetrics();

    const summary = metricsService.getMetricsSummary();

    // Verify metrics are reset
    expect(summary.overall.totalTasks).toBe(0);
    expect(summary.overall.averageInputTokens).toBe(0);
    expect(summary.overall.averageOutputTokens).toBe(0);

    // Verify reset was called
    expect(metricsService.resetMetrics).toHaveBeenCalledTimes(1);
  });

  test('accumulates metrics across multiple tasks', async () => {
    // Execute multiple tasks
    const tasks = [
      {
        goal: 'Test task 1',
        task: 'Write a test function',
        data: {}
      },
      {
        goal: 'Test task 2',
        task: 'Write a test function',
        data: {}
      },
      {
        goal: 'Test task 3',
        task: 'Write a test function',
        data: {}
      }
    ];

    for (const task of tasks) {
      await coderAgent.execute(task);
    }

    const summary = metricsService.getMetricsSummary();
    const coderMetrics = summary.byAgent['Software Engineer'];

    // Verify task count
    expect(coderMetrics.taskCount).toBe(3);

    // Verify metrics accumulation
    expect(coderMetrics.inputTokens).toBeGreaterThan(0);
    expect(coderMetrics.outputTokens).toBeGreaterThan(0);
    expect(coderMetrics.totalTokens).toBeGreaterThan(0);

    // Verify metrics were recorded for each task with correct data
    expect(metricsService.recordModelUsage).toHaveBeenCalledTimes(3);
    const calls = (metricsService.recordModelUsage as jest.Mock).mock.calls;
    calls.forEach(call => {
      expect(call[0]).toBe('Software Engineer');
      expect(call[1]).toEqual(expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
        contextLength: expect.any(Number),
        responseLength: expect.any(Number),
        duration: expect.any(Number)
      }));
    });

    // Verify metrics accumulation is correct
    const firstCall = calls[0][1];
    const lastCall = calls[2][1];
    expect(coderMetrics.inputTokens).toBe(
      firstCall.inputTokens + calls[1][1].inputTokens + lastCall.inputTokens
    );
    expect(coderMetrics.outputTokens).toBe(
      firstCall.outputTokens + calls[1][1].outputTokens + lastCall.outputTokens
    );
    expect(coderMetrics.totalTokens).toBe(
      firstCall.totalTokens + calls[1][1].totalTokens + lastCall.totalTokens
    );
  });

  test('handles failed tasks gracefully', async () => {
    // Mock Claude client to throw an error
    const mockError = new Error('API Error');
    const claude = new ClaudeClient({ apiKey: 'test-key', model: 'test-model' });
    (claude.complete as jest.Mock).mockRejectedValueOnce(mockError);

    const coderConfig = {
      claude,
      backplane,
      rolePath: 'src/roles/coder.json',
      tools: [],
      roleLoader,
      memory
    };
    coderAgent = new Agent(coderConfig);
    await coderAgent.init(coderConfig);

    // Execute task that will fail
    const result = await coderAgent.execute({
      goal: 'Test error handling',
      task: 'This will fail',
      data: {}
    });

    expect(result.success).toBe(false);
    expect(result.result).toBe('API Error');

    const summary = metricsService.getMetricsSummary();
    expect(summary.overall.totalTasks).toBe(0);
    expect(metricsService.recordModelUsage).not.toHaveBeenCalled();
  });
});
