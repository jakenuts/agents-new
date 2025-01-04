import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logging/base.js';
import { LogComponent } from '../logging/types.js';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

interface MessageParam {
  role: 'user' | 'assistant';
  content: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private totalTokensUsed: number = 0;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({apiKey:config.apiKey});
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.defaultMaxTokens = config.maxTokens || 1000;
    this.defaultTemperature = config.temperature || 0.7;

    logger.info(LogComponent.CLAUDE, 'Initialized Claude client', {
      model: this.model,
      defaultMaxTokens: this.defaultMaxTokens,
      defaultTemperature: this.defaultTemperature
    });
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    const systemPrompt = options.systemPrompt || '';
    const maxTokens = options.maxTokens || this.defaultMaxTokens;
    const temperature = options.temperature || this.defaultTemperature;

    const messages: MessageParam[] = [
      ...(systemPrompt ? [{ role: 'user' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: prompt }
    ];

    logger.debug(LogComponent.CLAUDE, 'Sending completion request', {
      promptLength: prompt.length,
      hasSystemPrompt: !!systemPrompt,
      maxTokens,
      temperature
    });

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages
      });

      const duration = Date.now() - startTime;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      this.totalTokensUsed += inputTokens + outputTokens;

      logger.info(LogComponent.CLAUDE, 'Completion successful', {
        duration,
        inputTokens,
        outputTokens,
        totalTokensUsed: this.totalTokensUsed,
        responseLength: response.content[0]?.type === 'text' ? response.content[0].text.length : 0
      });

      const firstContent = response.content[0];
      if (firstContent.type === 'text') {
        return firstContent.text;
      }
      throw new Error('Unexpected response format: First content block is not text');
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(LogComponent.CLAUDE, 'Completion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        promptLength: prompt.length
      });
      throw new Error(
        error instanceof Error ? error.message : 'Unknown Claude API error'
      );
    }
  }

  async countTokens(text: string): Promise<number> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.messages.countTokens({
        model: this.model,
        messages: [{ role: 'user' as const, content: text }]
      });

      const duration = Date.now() - startTime;
      logger.debug(LogComponent.CLAUDE, 'Token count successful', {
        textLength: text.length,
        tokenCount: response.input_tokens,
        duration
      });

      return response.input_tokens;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(LogComponent.CLAUDE, 'Token counting failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length,
        duration
      });
      throw new Error(
        error instanceof Error ? error.message : 'Unknown token counting error'
      );
    }
  }

  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }
}
