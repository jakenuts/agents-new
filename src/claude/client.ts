import Anthropic from '@anthropic-ai/sdk';

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

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({apiKey:config.apiKey});
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.defaultMaxTokens = config.maxTokens || 1000;
    this.defaultTemperature = config.temperature || 0.7;
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {}
  ): Promise<string> {
    const systemPrompt = options.systemPrompt || '';
    const maxTokens = options.maxTokens || this.defaultMaxTokens;
    const temperature = options.temperature || this.defaultTemperature;

    const messages: MessageParam[] = [
      ...(systemPrompt ? [{ role: 'user' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: prompt }
    ];

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages
      });

      const firstContent = response.content[0];
      if (firstContent.type === 'text') {
        return firstContent.text;
      }
      throw new Error('Unexpected response format: First content block is not text');
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Unknown Claude API error'
      );
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      const response = await this.client.messages.countTokens({
        model: this.model,
        messages: [{ role: 'user' as const, content: text }]
      });
      return response.input_tokens;
    } catch (error) {
      console.error('Token counting error:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Unknown token counting error'
      );
    }
  }
}
