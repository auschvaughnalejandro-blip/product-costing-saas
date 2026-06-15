import { config } from '../../config';
import { GeminiProvider } from './gemini';
import { DisabledAiProvider, type AiProvider } from './provider';

let cached: AiProvider | null = null;

/** The configured AI provider (Gemini if a key is set, otherwise a no-op). */
export function getAiProvider(): AiProvider {
  if (!cached) {
    cached =
      config.ai.enabled && config.ai.provider === 'gemini'
        ? new GeminiProvider(config.ai.geminiApiKey, config.ai.geminiModel)
        : new DisabledAiProvider();
  }
  return cached;
}

export { type AiProvider, DisabledAiProvider } from './provider';
export { GeminiProvider } from './gemini';
