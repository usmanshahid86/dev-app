/**
 * AnthropicApiAgentProvider — Messages API with structured outputs (output_config.format).
 * Used when DEVAPP_AGENT_PROVIDER=anthropic-api. Credentials come from the environment
 * (ANTHROPIC_API_KEY or an `ant auth login` profile); the app never stores them.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AgentOperation, AgentProvider, AgentRunResult } from './AgentProvider';
import { AgentProviderError } from './AgentProvider';
import { parseOutput } from './structured';

export interface AnthropicApiConfig {
  model: string;
  maxTokens?: number;
}

export class AnthropicApiAgentProvider implements AgentProvider {
  readonly name = 'anthropic-api';
  readonly isDemo = false;
  private client: Anthropic | null = null;

  constructor(private readonly cfg: AnthropicApiConfig) {}

  private getClient(): Anthropic {
    if (!this.client) this.client = new Anthropic();
    return this.client;
  }

  async run<I, O>(op: AgentOperation<I, O>, input: I): Promise<AgentRunResult<O>> {
    const { system, user } = op.buildPrompt(input);
    const effort = op.effort === 'low' ? 'low' : op.effort === 'high' ? 'high' : 'medium';
    try {
      const response = await this.getClient().messages.parse({
        model: this.cfg.model,
        max_tokens: this.cfg.maxTokens ?? 16000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort, format: zodOutputFormat(op.output as any) },
      });
      if (response.stop_reason === 'refusal') {
        throw new AgentProviderError(
          'Model declined the request',
          this.name,
          'unknown',
          false,
          response.stop_details,
        );
      }
      const raw =
        response.parsed_output ??
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
      const output = parseOutput(this.name, op.output, raw);
      return {
        output,
        provider: this.name,
        meta: {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (err) {
      if (err instanceof AgentProviderError) throw err;
      if (err instanceof Anthropic.AuthenticationError)
        throw new AgentProviderError('Anthropic API authentication failed', this.name, 'auth', false);
      if (err instanceof Anthropic.RateLimitError)
        throw new AgentProviderError('Anthropic API rate limited', this.name, 'unavailable', true);
      if (err instanceof Anthropic.APIConnectionError)
        throw new AgentProviderError(
          `Anthropic API connection error: ${err.message}`,
          this.name,
          'unavailable',
          true,
        );
      if (err instanceof Anthropic.APIError)
        throw new AgentProviderError(
          `Anthropic API error ${err.status}: ${err.message}`,
          this.name,
          'unknown',
          false,
        );
      throw new AgentProviderError(
        `Anthropic provider failure: ${(err as Error).message}`,
        this.name,
        'unknown',
        false,
      );
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    return hasKey
      ? { ok: true, message: `anthropic-api (model ${this.cfg.model})` }
      : {
          ok: false,
          message:
            'ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN not set (an `ant auth login` profile may still work)',
        };
  }
}
