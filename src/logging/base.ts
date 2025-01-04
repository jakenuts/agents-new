import { Logger, LogLevel, LogComponent, LogEntry, LogFilter } from './types.js';

export class BaseLogger implements Logger {
  private entries: LogEntry[] = [];
  private minLevel: LogLevel = LogLevel.INFO;

  private log(level: LogLevel, component: LogComponent, message: string, metadata?: Record<string, any>): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      metadata
    };

    this.entries.push(entry);
    
    // Also output to console for immediate visibility
    const levelStr = LogLevel[level];
    const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    console.log(`[${entry.timestamp.toISOString()}] ${levelStr} [${component}] ${message}${metadataStr}`);
  }

  debug(component: LogComponent, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, component, message, metadata);
  }

  info(component: LogComponent, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, component, message, metadata);
  }

  warn(component: LogComponent, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, component, message, metadata);
  }

  error(component: LogComponent, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, component, message, metadata);
  }

  getEntries(filter?: LogFilter): LogEntry[] {
    let filtered = this.entries;

    if (filter) {
      filtered = filtered.filter(entry => {
        if (filter.level !== undefined && entry.level < filter.level) return false;
        if (filter.component !== undefined && entry.component !== filter.component) return false;
        if (filter.from !== undefined && entry.timestamp < filter.from) return false;
        if (filter.to !== undefined && entry.timestamp > filter.to) return false;
        return true;
      });
    }

    return [...filtered]; // Return copy to prevent external modification
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  clearEntries(): void {
    this.entries = [];
  }
}

// Global logger instance
export const logger = new BaseLogger();
