import Anthropic from '@anthropic-ai/sdk';

/**
 * Writing suggestions with the organization's own Anthropic API key (BYO key, opt-in; see
 * docs/phases/12-touch-wall-ai.md). The prompt and the answer are never stored or logged.
 */

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5';

export const AI_TASKS = ['text', 'alert', 'translate'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_PROMPT_MAX = 2000;
export const AI_SUGGESTION_MAX = 1000;

/** Why a suggestion failed, in words safe to show (no provider details). */
export type AiErrorCode =
  'invalid_key' | 'model_unavailable' | 'rate_limited' | 'unavailable' | 'refused' | 'empty';

export class AiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(`AI request failed: ${code}`);
    this.name = 'AiError';
  }
}

export interface AiSuggestInput {
  model: AiModel;
  task: AiTask;
  prompt: string;
  /** The language to write in (the interface language of the editor). */
  locale: 'he' | 'en';
}

export interface AiClient {
  suggest(input: AiSuggestInput): Promise<string>;
  /** Checks the key (and that it may use the model) without generating anything. */
  verify(model: AiModel): Promise<void>;
}

export type AiClientFactory = (apiKey: string) => AiClient;

const LANGUAGE = { he: 'Hebrew', en: 'English' } as const;

/**
 * Fixed instructions per task. The editor's text is only the user turn: it can ask for
 * wording, nothing else happens with the answer (it is shown for the editor to accept).
 */
export function systemPrompt(task: AiTask, locale: 'he' | 'en'): string {
  const common =
    'You write short texts for digital signage screens (lobbies, schools, offices). ' +
    'Reply with the text only: no preface, no quotes, no markdown, no explanations. ' +
    `Keep it under ${String(AI_SUGGESTION_MAX)} characters. ` +
    'Never invent facts such as dates, names, phone numbers or prices that were not given.';
  if (task === 'translate') {
    const target = locale === 'he' ? 'English' : 'Hebrew';
    return `${common} Translate the given text into ${target}, keeping its meaning and tone.`;
  }
  if (task === 'alert') {
    return (
      `${common} Write in ${LANGUAGE[locale]}. The text is an urgent notice or emergency ` +
      'instruction: calm, direct, imperative, one or two short sentences, readable from afar.'
    );
  }
  return (
    `${common} Write in ${LANGUAGE[locale]}. Improve or draft the requested message: ` +
    'clear, friendly, and short enough to read at a glance.'
  );
}

/** Opus and Sonnet can fall back to another model when a safety classifier declines. */
function fallbackParams(model: AiModel) {
  return model === 'claude-haiku-5-5'
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
}

function mapError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new AiError('invalid_key');
  if (error instanceof Anthropic.PermissionDeniedError) return new AiError('invalid_key');
  if (error instanceof Anthropic.NotFoundError) return new AiError('model_unavailable');
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate_limited');
  return new AiError('unavailable');
}

/** `options`: tests point the official SDK at a fake server (`baseURL`, `fetch`). */
export function createAnthropicAi(
  apiKey: string,
  options: Pick<ConstructorParameters<typeof Anthropic>[0] & object, 'baseURL' | 'fetch'> = {},
): AiClient {
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1, ...options });
  return {
    async suggest({ model, task, prompt, locale }) {
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          // Room for adaptive thinking; the answer itself is short.
          max_tokens: 4000,
          output_config: { effort: 'low' },
          system: systemPrompt(task, locale),
          messages: [{ role: 'user', content: prompt }],
          ...fallbackParams(model),
        });
      } catch (error) {
        throw mapError(error);
      }
      if (response.stop_reason === 'refusal') throw new AiError('refused');
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      if (!text) throw new AiError('empty');
      return text.slice(0, AI_SUGGESTION_MAX);
    },
    async verify(model) {
      try {
        await client.models.retrieve(model);
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}
