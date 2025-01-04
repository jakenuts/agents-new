import { ModelMetrics, AgentMetrics, MetricsSummary, MetricsService } from './types.js';
import { logger } from '../logging/base.js';
import { LogComponent } from '../logging/types.js';

export class InMemoryMetricsService implements MetricsService {
  private metrics: Record<string, AgentMetrics> = {};

  recordModelUsage(role: string, metrics: ModelMetrics): void {
    if (!this.metrics[role]) {
      this.metrics[role] = {
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

    const agentMetrics = this.metrics[role];
    agentMetrics.taskCount++;
    agentMetrics.inputTokens += metrics.inputTokens;
    agentMetrics.outputTokens += metrics.outputTokens;
    agentMetrics.totalTokens += metrics.totalTokens;
    agentMetrics.contextLength += metrics.contextLength;
    agentMetrics.responseLength += metrics.responseLength;
    agentMetrics.duration += metrics.duration;

    logger.debug(LogComponent.AGENT, 'Recorded model usage metrics', {
      role,
      metrics: {
        ...metrics,
        totalTasks: agentMetrics.taskCount,
        averageDuration: agentMetrics.duration / agentMetrics.taskCount
      }
    });
  }

  getMetricsSummary(): MetricsSummary {
    let totalTasks = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalContextLength = 0;
    let totalResponseLength = 0;
    let totalDuration = 0;

    // Calculate totals
    Object.values(this.metrics).forEach(metrics => {
      totalTasks += metrics.taskCount;
      totalInputTokens += metrics.inputTokens;
      totalOutputTokens += metrics.outputTokens;
      totalTokens += metrics.totalTokens;
      totalContextLength += metrics.contextLength;
      totalResponseLength += metrics.responseLength;
      totalDuration += metrics.duration;
    });

    // Calculate averages
    const summary: MetricsSummary = {
      byAgent: this.metrics,
      overall: {
        totalTasks,
        averageInputTokens: totalTasks > 0 ? totalInputTokens / totalTasks : 0,
        averageOutputTokens: totalTasks > 0 ? totalOutputTokens / totalTasks : 0,
        averageTotalTokens: totalTasks > 0 ? totalTokens / totalTasks : 0,
        averageContextLength: totalTasks > 0 ? totalContextLength / totalTasks : 0,
        averageResponseLength: totalTasks > 0 ? totalResponseLength / totalTasks : 0,
        averageDuration: totalTasks > 0 ? totalDuration / totalTasks : 0
      }
    };

    logger.info(LogComponent.AGENT, 'Generated metrics summary', {
      totalTasks,
      averageTokensPerTask: summary.overall.averageTotalTokens,
      averageDuration: summary.overall.averageDuration
    });

    return summary;
  }

  resetMetrics(): void {
    this.metrics = {};
    logger.info(LogComponent.AGENT, 'Reset metrics');
  }
}

// Create a global metrics service instance
export const metricsService = new InMemoryMetricsService();
