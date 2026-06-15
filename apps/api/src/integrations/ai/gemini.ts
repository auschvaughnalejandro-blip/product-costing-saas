/** Google Gemini implementation of the AI provider. */
import { logger } from '../../lib/logger';
import type { AiProvider, GenerateOptions } from './provider';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate({ system, prompt }: GenerateOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      logger.warn('Gemini request failed', data.error?.message ?? res.statusText);
      throw new Error(data.error?.message ?? `Gemini request failed (${res.status}).`);
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return text.trim() || 'The assistant had nothing to add.';
  }
}
