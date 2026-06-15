/** The editable, stored shape of a product (maps 1:1 onto engine input + master data). */
import type { BomNode, Numeric, Operation, OverheadRule } from '@costing/shared';

/** Rate settings stored against a product (materials are separate master data). */
export interface ProductRateSettings {
  labourRate: Numeric;
  machineRate: Numeric;
  overhead: OverheadRule;
  labourRates?: Record<string, Numeric>;
  machineRates?: Record<string, Numeric>;
  currency?: string;
}

/** Everything needed to create/replace a product definition. */
export interface ProductDefinitionInput {
  code: string;
  name: string;
  description?: string;
  currency?: string;
  /** The bill of materials tree; each node's `materialId` is a material CODE. */
  bom: BomNode;
  routing: Operation[];
  rates: ProductRateSettings;
}

/** A stored product definition, loaded back from the database. */
export interface ProductDefinition extends ProductDefinitionInput {
  id: string;
  currency: string;
}

/** Lightweight product header for listings. */
export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  updatedAt: string;
}
