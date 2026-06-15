/**
 * The swappable AI provider interface. The rest of the app talks to AI only
 * through `generate(...)`, so the model can be changed later (Gemini → something
 * else) by writing one new implementation — nothing else changes.
 */
export interface GenerateOptions {
  /** System instruction describing the assistant's role and hard rules. */
  system: string;
  /** The user-facing prompt, including grounding context. */
  prompt: string;
}

export interface AiProvider {
  readonly name: string;
  /** True only when the provider is actually usable (e.g. an API key is set). */
  readonly enabled: boolean;
  generate(options: GenerateOptions): Promise<string>;
}

/** Provider used when no AI is configured. It never fabricates anything. */
export class DisabledAiProvider implements AiProvider {
  readonly name = 'none';
  readonly enabled = false;
  async generate(): Promise<string> {
    return 'The AI assistant is not configured. Set GEMINI_API_KEY to enable it.';
  }
}
