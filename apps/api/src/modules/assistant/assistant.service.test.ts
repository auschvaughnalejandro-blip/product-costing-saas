import { describe, expect, it } from 'vitest';
import { ingestExcel, sampleWorkbookSpec } from '../../ingestion';
import { DisabledAiProvider, type AiProvider } from '../../integrations/ai/provider';
import { explain, parseWorkbookSpec, suggestExcelFix } from './assistant.service';

function fakeProvider(reply: string): AiProvider {
  return { name: 'fake', enabled: true, generate: async () => reply };
}

describe('assistant — explain', () => {
  it('answers using the provider, grounded in the supplied context', async () => {
    const r = await explain(fakeProvider('Material is the biggest driver here.'), {
      question: 'Why is the cost so high?',
      context: { total: { material: '20.00', total: '108.00' } },
    });
    expect(r.answer).toContain('Material');
    expect(r.grounded).toBe(true);
  });

  it('never fabricates when AI is disabled — it says so', async () => {
    const r = await explain(new DisabledAiProvider(), { question: 'anything' });
    expect(r.grounded).toBe(false);
    expect(r.answer).toMatch(/isn.t configured|not configured/i);
  });
});

describe('assistant — Excel fix suggestion', () => {
  it('turns a proposed spec into a valid, re-uploadable file (not auto-applied)', async () => {
    // The model "returns" a corrected workbook spec; we render it to a real file.
    const reply = JSON.stringify(sampleWorkbookSpec());
    const r = await suggestExcelFix(fakeProvider(reply), [
      { sheet: 'Parts', code: 'no_root', message: 'No root.' },
    ]);
    expect(r.fileBase64).toBeTruthy();

    // The proposed file passes the SAME validation as any upload.
    const ingest = await ingestExcel(Buffer.from(r.fileBase64!, 'base64'));
    expect(ingest.ok).toBe(true);
  });

  it('handles a non-JSON model reply gracefully', async () => {
    const r = await suggestExcelFix(fakeProvider('Sorry, I cannot help.'), [
      { sheet: 'Parts', code: 'x', message: 'y' },
    ]);
    expect(r.fileBase64).toBeUndefined();
    expect(r.summary).toMatch(/manually/i);
  });

  it('returns a clear message (no file) when AI is disabled', async () => {
    const r = await suggestExcelFix(new DisabledAiProvider(), []);
    expect(r.enabled).toBe(false);
    expect(r.fileBase64).toBeUndefined();
  });

  it('parses JSON wrapped in code fences', () => {
    expect(parseWorkbookSpec('```json\n{"materials":[],"parts":[],"settings":{}}\n```')).not.toBeNull();
    expect(parseWorkbookSpec('no json here')).toBeNull();
  });
});
