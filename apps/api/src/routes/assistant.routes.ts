import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { getAiProvider } from '../integrations/ai';
import { explain, suggestExcelFix } from '../modules/assistant/assistant.service';

const ExplainSchema = z.object({
  question: z.string().min(1),
  context: z.unknown().optional(),
});

const FixSchema = z.object({
  errors: z.array(
    z.object({
      sheet: z.string(),
      row: z.number().optional(),
      column: z.string().optional(),
      code: z.string(),
      message: z.string(),
    }),
  ),
});

export function assistantRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/status', (_req, res) => {
    const provider = getAiProvider();
    res.json({ enabled: provider.enabled, provider: provider.name });
  });

  r.post(
    '/explain',
    asyncHandler(async (req, res) => {
      const body = ExplainSchema.parse(req.body);
      res.json(await explain(getAiProvider(), body));
    }),
  );

  r.post(
    '/suggest-fix',
    asyncHandler(async (req, res) => {
      const body = FixSchema.parse(req.body);
      res.json(await suggestExcelFix(getAiProvider(), body.errors));
    }),
  );

  return r;
}
