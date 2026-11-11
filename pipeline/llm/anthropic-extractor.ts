/**
 * Extraction through Claude (default claude-opus-5-5): streaming request with a
 * JSON-schema structured output, adaptive thinking, explicit effort, and the
 * server-side refusal fallback ("default" routing). The raw JSON is returned to
 * the caller, which validates it with zod and runs the grounding checks.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Extractor, ExtractionOutcome, LlmUsage } from '../types.ts';

export type BetaFinalMessage = (params: Anthropic.Beta.MessageCreateParamsStreaming | Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

/** Production: stream and collect the final message (avoids HTTP timeouts on long outputs). */
export function sdkStreamFinal(client: Anthropic): BetaFinalMessage {
  return (params) => {
    const { stream: _stream, ...body } = params as Anthropic.Beta.MessageCreateParamsStreaming;
    return client.beta.messages.stream(body).finalMessage();
  };
}

export interface AnthropicExtractorOptions {
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  call: BetaFinalMessage;
}

export function usageFromMessage(msg: Anthropic.Beta.BetaMessage, requestedModel: string): LlmUsage[] {
  const iterations = msg.usage.iterations;
  if (iterations && iterations.length) {
    const out: LlmUsage[] = [];
    for (const it of iterations) {
      if (!('input_tokens' in it)) continue;
      const model = 'model' in it && it.model ? String(it.model) : requestedModel;
      out.push({
        model,
        inputTokens: it.input_tokens,
        outputTokens: it.output_tokens,
        cacheReadInputTokens: it.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: it.cache_creation_input_tokens ?? 0,
      });
    }
    if (out.length) return out;
  }
  return [
    {
      model: msg.model || requestedModel,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
    },
  ];
}

export class AnthropicExtractor implements Extractor {
  readonly name = 'anthropic';

  constructor(private readonly o: AnthropicExtractorOptions) {}

  async extract(input: { system: string; user: string; jsonSchema: Record<string, unknown> }): Promise<ExtractionOutcome> {
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await this.o.call({
        model: this.o.model,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: this.o.effort, format: { type: 'json_schema', schema: input.jsonSchema } },
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
        stream: true,
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: `rate limited: ${e.message}`, usage: [] };
      if (e instanceof Anthropic.AuthenticationError) throw e; // configuration problem: abort the run
      if (e instanceof Anthropic.BadRequestError) return { ok: false, reason: `bad request: ${e.message}`, usage: [] };
      if (e instanceof Anthropic.APIError) return { ok: false, reason: `API error ${e.status ?? ''}: ${e.message}`, usage: [] };
      if (e instanceof Error && /JSON/i.test(e.name)) return { ok: false, reason: `unparseable stream: ${e.message}`, usage: [] };
      throw e;
    }
    const usage = usageFromMessage(msg, this.o.model);
    if (msg.stop_reason === 'refusal') {
      const cat = msg.stop_details && 'category' in msg.stop_details ? String(msg.stop_details.category ?? 'unknown') : 'unknown';
      return { ok: false, reason: `model declined (refusal, category ${cat})`, usage };
    }
    if (msg.stop_reason === 'max_tokens') return { ok: false, reason: 'output truncated (max_tokens)', usage };
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return { ok: true, json: JSON.parse(text) as unknown, usage };
    } catch {
      return { ok: false, reason: 'output was not valid JSON', usage };
    }
  }
}
