export interface Parameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  items?: Parameter; // For array types
  properties?: Record<string, Parameter>; // For object types
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output: T;
  error?: string;
  metadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    resourcesUsed?: string[];
    warnings?: string[];
    retries?: number;
    cacheHit?: boolean;
    dependencies?: string[];
  };
}

export interface ToolOptions {
  caching?: {
    enabled: boolean;
    ttl: number; // Time to live in milliseconds
    keyGenerator?: (params: unknown) => string;
  };
  retry?: {
    attempts: number;
    delay: number; // Delay between retries in milliseconds
    backoff?: 'linear' | 'exponential';
  };
  timeout?: number; // Timeout in milliseconds
  dependencies?: string[]; // Names of tools this tool depends on
}

export interface Tool<TParams = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: Parameter[];
  requiresApproval: boolean;
  options?: ToolOptions;
  execute(params: TParams): Promise<ToolResult<TOutput>>;
}

interface CacheEntry<T> {
  result: ToolResult<T>;
  expiresAt: number;
}

export abstract class BaseTool<TParams = unknown, TOutput = unknown> implements Tool<TParams, TOutput> {
  abstract name: string;
  abstract description: string;
  abstract parameters: Parameter[];
  requiresApproval: boolean = false;
  options?: ToolOptions;

  private cache = new Map<string, CacheEntry<TOutput>>();

  constructor(options?: ToolOptions) {
    this.options = options;
  }

  async execute(params: TParams): Promise<ToolResult<TOutput>> {
    const startTime = new Date();
    let retries = 0;
    let lastError: Error | null = null;

    // Check cache if enabled
    if (this.options?.caching?.enabled) {
      const cacheKey = this.getCacheKey(params);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return {
          ...cached.result,
          metadata: {
            ...cached.result.metadata,
            cacheHit: true
          }
        };
      }
    }

    // Execute with retries if configured
    const maxAttempts = this.options?.retry?.attempts ?? 1;
    const delay = this.options?.retry?.delay ?? 1000;
    const backoff = this.options?.retry?.backoff ?? 'linear';

    while (retries < maxAttempts) {
      try {
        // 1. Validate parameters
        this.validateParams(params);

        // 2. Check dependencies
        await this.checkDependencies();

        // 3. Execute with timeout if configured
        const result = await this.executeWithTimeout(params);

        // 4. Cache result if enabled
        if (this.options?.caching?.enabled) {
          const cacheKey = this.getCacheKey(params);
          this.cache.set(cacheKey, {
            result,
            expiresAt: Date.now() + (this.options.caching.ttl ?? 3600000)
          });
        }

        return {
          ...result,
          metadata: {
            ...result.metadata,
            retries,
            duration: new Date().getTime() - startTime.getTime(),
            dependencies: this.options?.dependencies
          }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        retries++;

        if (retries < maxAttempts) {
          // Calculate delay based on backoff strategy
          const retryDelay = backoff === 'exponential'
            ? delay * Math.pow(2, retries - 1)
            : delay * retries;

          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    return {
      success: false,
      output: null as unknown as TOutput,
      error: lastError?.message ?? 'Tool execution failed',
      metadata: {
        startTime,
        endTime: new Date(),
        duration: new Date().getTime() - startTime.getTime(),
        retries,
        dependencies: this.options?.dependencies
      }
    };
  }

  protected abstract executeImpl(params: TParams): Promise<TOutput>;

  private async executeWithTimeout(params: TParams): Promise<ToolResult<TOutput>> {
    const startTime = new Date();
    const timeout = this.options?.timeout;

    try {
      const executePromise = this.executeImpl(params);

      const result = timeout
        ? await Promise.race([
            executePromise,
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Tool execution timed out after ${timeout}ms`));
              }, timeout);
            })
          ])
        : await executePromise;

      return {
        success: true,
        output: result,
        metadata: {
          startTime,
          endTime: new Date(),
          duration: new Date().getTime() - startTime.getTime()
        }
      };
    } catch (error) {
      return {
        success: false,
        output: null as unknown as TOutput,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          startTime,
          endTime: new Date(),
          duration: new Date().getTime() - startTime.getTime()
        }
      };
    }
  }

  private async checkDependencies(): Promise<void> {
    if (!this.options?.dependencies?.length) return;

    // In a real implementation, this would check if required tools are available
    // and potentially initialize them if needed
    for (const dep of this.options.dependencies) {
      if (!this.isDependencyAvailable(dep)) {
        throw new Error(`Required dependency not available: ${dep}`);
      }
    }
  }

  private isDependencyAvailable(name: string): boolean {
    // This would be implemented based on how tools are registered/managed
    return true;
  }

  protected validateParams(params: unknown): void {
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be an object');
    }

    const paramObj = params as Record<string, unknown>;

    // Check required parameters
    for (const param of this.parameters) {
      if (param.required && !(param.name in paramObj)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }

      const value = paramObj[param.name];
      if (value !== undefined) {
        this.validateParam(param, value);
      }
    }
  }

  private validateParam(param: Parameter, value: unknown): void {
    // Type validation
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`${param.name} must be a string`);
        }
        if (param.enum && !param.enum.includes(value)) {
          throw new Error(
            `${param.name} must be one of: ${param.enum.join(', ')}`
          );
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`${param.name} must be a number`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`${param.name} must be a boolean`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`${param.name} must be an array`);
        }
        if (param.items) {
          value.forEach((item, index) => {
            try {
              this.validateParam(param.items!, item);
            } catch (error) {
              throw new Error(
                `${param.name}[${index}]: ${error instanceof Error ? error.message : 'Invalid item'}`
              );
            }
          });
        }
        break;

      case 'object':
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`${param.name} must be an object`);
        }
        if (param.properties) {
          const objValue = value as Record<string, unknown>;
          for (const [key, propParam] of Object.entries(param.properties)) {
            if (key in objValue) {
              try {
                this.validateParam(propParam, objValue[key]);
              } catch (error) {
                throw new Error(
                  `${param.name}.${key}: ${error instanceof Error ? error.message : 'Invalid property'}`
                );
              }
            } else if (propParam.required) {
              throw new Error(
                `${param.name}.${key} is required`
              );
            }
          }
        }
        break;
    }
  }

  private getCacheKey(params: unknown): string {
    if (this.options?.caching?.keyGenerator) {
      return this.options.caching.keyGenerator(params);
    }

    // Default cache key generation
    return `${this.name}:${JSON.stringify(params)}`;
  }

  protected clearCache(): void {
    this.cache.clear();
  }

  protected invalidateCacheEntry(params: TParams): void {
    const cacheKey = this.getCacheKey(params);
    this.cache.delete(cacheKey);
  }
}

export class ComposedTool<TParams, TOutput> extends BaseTool<TParams, TOutput> {
  constructor(
    private config: {
      name: string;
      description: string;
      parameters: Parameter[];
      tools: Tool[];
      compose: (tools: Tool[], params: TParams) => Promise<TOutput>;
      options?: ToolOptions;
    }
  ) {
    super(config.options);
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters;
    this.options = {
      ...config.options,
      dependencies: config.tools.map(t => t.name)
    };
  }

  name: string;
  description: string;
  parameters: Parameter[];

  protected async executeImpl(params: TParams): Promise<TOutput> {
    return await this.config.compose(this.config.tools, params);
  }
}
