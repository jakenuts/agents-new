export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export enum LogComponent {
  AGENT = 'agent',
  BACKPLANE = 'backplane',
  CONTEXT = 'context',
  MEMORY = 'memory',
  TOOL = 'tool',
  CLAUDE = 'claude'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: LogComponent;
  message: string;
  metadata?: Record<string, any>;
}

export interface LogFilter {
  level?: LogLevel;
  component?: LogComponent;
  from?: Date;
  to?: Date;
}

export interface Logger {
  debug(component: LogComponent, message: string, metadata?: Record<string, any>): void;
  info(component: LogComponent, message: string, metadata?: Record<string, any>): void;
  warn(component: LogComponent, message: string, metadata?: Record<string, any>): void;
  error(component: LogComponent, message: string, metadata?: Record<string, any>): void;
  getEntries(filter?: LogFilter): LogEntry[];
  setMinLevel(level: LogLevel): void;
  clearEntries(): void;
}
