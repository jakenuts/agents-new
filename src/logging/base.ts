import { Logger, LogLevel, LogComponent, LogEntry, LogFilter } from './types.js';

export class BaseLogger implements Logger {
  private static instance: BaseLogger;
  private entries: LogEntry[] = [];
  private minLevel: LogLevel = LogLevel.INFO;

  constructor() {
    if (!BaseLogger.instance) {
      BaseLogger.instance = this;
    }
    return BaseLogger.instance;
  }

  private log(level: LogLevel, component: LogComponent, message: string, metadata?: Record<string, any>): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      metadata
    };

    // Store the entry in memory
    this.entries.push(entry);
    
    // Format metadata for console output
    const levelStr = LogLevel[level];
    const metadataStr = metadata ? JSON.stringify(metadata).replace(/"/g, '') : '';
    
    // Output to console for immediate visibility
    console.log(`[${entry.timestamp.toISOString()}] ${levelStr} [${component}] ${message}${metadataStr ? ' ' + metadataStr : ''}`);
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
    let filtered = [...this.entries]; // Create a copy to avoid external modification

    if (filter) {
      filtered = filtered.filter(entry => {
        if (filter.level !== undefined && entry.level < filter.level) return false;
        if (filter.component !== undefined && entry.component !== filter.component) return false;
        if (filter.from !== undefined && entry.timestamp < filter.from) return false;
        if (filter.to !== undefined && entry.timestamp > filter.to) return false;
        return true;
      });
    }

    return filtered;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  clearEntries(): void {
    this.entries = [];
  }
}

// Create a global logger instance
const globalLogger = new BaseLogger();

// Export both the class and the global instance
export { globalLogger as logger };

// Make logger globally available
if (typeof global !== 'undefined') {
  (global as any).logger = globalLogger;
} else if (typeof window !== 'undefined') {
  (window as any).logger = globalLogger;
}
