/**
 * Request validation schemas (zod). These check the SHAPE of incoming data and
 * return clear 400s. Deep semantic validation (missing rates, circular refs,
 * negative numbers) is the engine's job — these two layers complement each other.
 */
import { z } from 'zod';
import type {
  BomNode,
  CostInput,
  Operation,
  OverheadRule,
  Rates,
} from '@costing/shared';
import type { ProductDefinitionInput, ProductRateSettings } from './types';

const Numeric = z.union([z.number(), z.string()]);

export const BomNodeSchema: z.ZodType<BomNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string(),
    quantity: Numeric,
    unit: z.string().optional(),
    materialId: z.string().optional(),
    children: z.array(BomNodeSchema).optional(),
  }),
);

export const OperationSchema: z.ZodType<Operation> = z.object({
  id: z.string().min(1),
  name: z.string(),
  partId: z.string().min(1),
  machineTime: Numeric,
  labourTime: Numeric,
  machineRateId: z.string().optional(),
  labourRateId: z.string().optional(),
});

export const OverheadRuleSchema: z.ZodType<OverheadRule> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('percentage'),
    percent: Numeric,
    base: z.enum(['material', 'conversion', 'prime', 'total']).optional(),
  }),
  z.object({ type: z.literal('fixed'), amount: Numeric }),
]);

const MaterialRateSchema = z.object({
  unitPrice: Numeric,
  unit: z.string().optional(),
  description: z.string().optional(),
});

export const RatesSchema: z.ZodType<Rates> = z.object({
  materials: z.record(z.string(), MaterialRateSchema),
  labourRate: Numeric,
  machineRate: Numeric,
  labourRates: z.record(z.string(), Numeric).optional(),
  machineRates: z.record(z.string(), Numeric).optional(),
  overhead: OverheadRuleSchema,
  currency: z.string().optional(),
});

export const CostInputSchema: z.ZodType<CostInput> = z.object({
  product: BomNodeSchema,
  routing: z.array(OperationSchema),
  rates: RatesSchema,
  currency: z.string().optional(),
});

const ProductRateSettingsSchema: z.ZodType<ProductRateSettings> = z.object({
  labourRate: Numeric,
  machineRate: Numeric,
  overhead: OverheadRuleSchema,
  labourRates: z.record(z.string(), Numeric).optional(),
  machineRates: z.record(z.string(), Numeric).optional(),
  currency: z.string().optional(),
});

export const ProductDefinitionInputSchema: z.ZodType<ProductDefinitionInput> = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().optional(),
  bom: BomNodeSchema,
  routing: z.array(OperationSchema),
  rates: ProductRateSettingsSchema,
});

export const RecalculateSchema = z.object({ input: CostInputSchema });
