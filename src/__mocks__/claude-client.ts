export const mockClaudeResponse = {
  content: [{ type: 'text', text: 'Mock response from Claude' }],
  usage: {
    input_tokens: 100,
    output_tokens: 50
  }
};

export const mockCountTokensResponse = {
  input_tokens: 100
};

const mockAnthropicClient = {
  messages: {
    create: jest.fn().mockResolvedValue(mockClaudeResponse),
    countTokens: jest.fn().mockResolvedValue(mockCountTokensResponse)
  }
};

export class ClaudeClient {
  private client: any;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private totalTokensUsed: number = 0;

  constructor(config: any) {
    this.client = mockAnthropicClient;
    this.model = config.model || 'test-model';
    this.defaultMaxTokens = config.maxTokens || 1000;
    this.defaultTemperature = config.temperature || 0.7;
  }

  async complete(prompt: string, options: any = {}): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || this.defaultMaxTokens,
      temperature: options.temperature || this.defaultTemperature,
      messages: [{ role: 'user', content: prompt }]
    });

    this.totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    return response.content[0].text;
  }

  async countTokens(text: string): Promise<number> {
    const response = await this.client.messages.countTokens({
      model: this.model,
      messages: [{ role: 'user', content: text }]
    });
    return response.input_tokens;
  }

  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }
}
