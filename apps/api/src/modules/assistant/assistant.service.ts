/**
 * The assistant service. It builds grounded prompts from the on-screen context
 * and asks the AI provider to EXPLAIN. It never feeds AI output back as a cost
 * figure — answers are returned as plain text, and any proposed Excel fix is
 * returned for the user to APPROVE (by re-uploading it through the normal,
 * validated path) — it is never applied automatically.
 */
import type { ValidationProblem } from '@costing/shared';
import type { AiProvider } from '../../integrations/ai/provider';
import { writeWorkbook, type WorkbookSpec } from '../../ingestion';
import { ASSISTANT_SYSTEM, FIX_SYSTEM, FORMAT_SUMMARY } from './prompts';

export interface ExplainRequest {
  question: string;
  /** On-screen data to ground the answer (cost breakdown, figures, errors...). */
  context?: unknown;
}

export interface ExplainResult {
  answer: string;
  grounded: boolean;
  provider: string;
}

export async function explain(provider: AiProvider, req: ExplainRequest): Promise<ExplainResult> {
  if (!provider.enabled) {
    return {
      answer:
        'The AI assistant isn’t configured on this server. Set GEMINI_API_KEY to enable plain-language explanations. The cost figures shown are always produced by the costing engine.',
      grounded: false,
      provider: provider.name,
    };
  }

  const context = req.context ? JSON.stringify(req.context, null, 2) : '(none provided)';
  const prompt = `On-screen context (JSON — these numbers come from the costing engine and are authoritative):\n${context}\n\nUser question: ${req.question}`;
  const answer = await provider.generate({ system: ASSISTANT_SYSTEM, prompt });
  return { answer, grounded: Boolean(req.context), provider: provider.name };
}

export interface FixSuggestion {
  enabled: boolean;
  /** Plain-language summary of what's proposed. */
  summary: string;
  /** A corrected workbook (base64 .xlsx) the user can download, review and re-upload. */
  filename?: string;
  fileBase64?: string;
}

/** Pull a JSON object out of a model response that may be wrapped in prose/fences. */
export function parseWorkbookSpec(raw: string): WorkbookSpec | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(withoutFences.slice(start, end + 1)) as Partial<WorkbookSpec>;
    if (Array.isArray(parsed.materials) && Array.isArray(parsed.parts) && parsed.settings) {
      return parsed as WorkbookSpec;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function suggestExcelFix(
  provider: AiProvider,
  errors: ValidationProblem[],
): Promise<FixSuggestion> {
  if (!provider.enabled) {
    return {
      enabled: false,
      summary:
        'The AI assistant isn’t configured, so it can’t propose a corrected file. Download the blank template and fix the highlighted problems manually.',
    };
  }

  const problemList = errors
    .map((e) => `- [${e.sheet}${e.row ? ` row ${e.row}` : ''}${e.column ? `, ${e.column}` : ''}] ${e.message}`)
    .join('\n');
  const prompt = `Required format:\n${FORMAT_SUMMARY}\n\nValidation problems to fix:\n${problemList}\n\nReturn the corrected WorkbookSpec JSON.`;

  const raw = await provider.generate({ system: FIX_SYSTEM, prompt });
  const spec = parseWorkbookSpec(raw);
  if (!spec) {
    return {
      enabled: true,
      summary:
        'The assistant couldn’t produce a valid corrected file from these problems. Please fix them manually using the template.',
    };
  }

  // Turn the proposed spec into a real .xlsx. It is NOT applied — the user
  // downloads it, reviews it, and re-uploads it through the normal validated path.
  const buffer = await writeWorkbook(spec);
  return {
    enabled: true,
    summary:
      'Proposed a corrected spreadsheet based on the validation problems. Download it, check the values, then re-upload it to apply — it goes through the same validation as any upload.',
    filename: 'corrected-upload.xlsx',
    fileBase64: buffer.toString('base64'),
  };
}
