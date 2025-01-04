export interface ModelMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextLength: number;
  responseLength: number;
  duration: number;
}

export interface AgentMetrics extends ModelMetrics {
  role: string;
  taskCount: number;
}

export interface MetricsSummary {
  byAgent: Record<string, AgentMetrics>;
  overall: {
    totalTasks: number;
    averageInputTokens: number;
    averageOutputTokens: number;
    averageTotalTokens: number;
    averageContextLength: number;
    averageResponseLength: number;
    averageDuration: number;
  };
}

export interface MetricsService {
  recordModelUsage(role: string, metrics: ModelMetrics): void;
  getMetricsSummary(): MetricsSummary;
  resetMetrics(): void;
}
