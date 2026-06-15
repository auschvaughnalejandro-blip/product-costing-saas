/**
 * Map SAP S/4HANA cost/BOM data into the SAME shape Excel produces after
 * validation (`ValidatedData`). Because both sources converge here, the rest of
 * the pipeline — mapToProduct → engine — doesn't care where the data came from.
 */
import type { OverheadRule } from '@costing/shared';
import type {
  ValidatedData,
  ValidatedMaterial,
  ValidatedOperation,
  ValidatedPart,
} from '../../ingestion/validate';

/** A normalised view of what an S/4HANA BOM + costing call returns. */
export interface SapBomResponse {
  Material: string;
  MaterialDescription: string;
  Currency?: string;
  Components: {
    Component: string;
    Description: string;
    Quantity: number | string;
    ParentComponent?: string;
    ComponentUnit?: string;
    /** Standard price from the material master, if this component is purchased. */
    Price?: number | string;
  }[];
  Operations?: {
    Operation: string;
    Component: string;
    Description: string;
    MachineTime: number | string;
    LabourTime: number | string;
  }[];
  Rates: {
    LabourRate: number | string;
    MachineRate: number | string;
    OverheadPercent?: number | string;
  };
}

function num(value: number | string | undefined, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeSapToValidatedData(raw: SapBomResponse): ValidatedData {
  const currency = raw.Currency || 'USD';

  // Material master prices → validated materials (only priced components).
  const materials: ValidatedMaterial[] = raw.Components.filter((c) => c.Price !== undefined).map(
    (c) => ({
      code: c.Component,
      name: c.Description,
      unit: c.ComponentUnit,
      unitPrice: num(c.Price),
    }),
  );

  // The product root plus each BOM component as a part.
  const parts: ValidatedPart[] = [
    { nodeId: raw.Material, name: raw.MaterialDescription, quantity: 1 },
    ...raw.Components.map((c) => ({
      nodeId: c.Component,
      parentId: c.ParentComponent ?? raw.Material,
      name: c.Description,
      quantity: num(c.Quantity, 1),
      unit: c.ComponentUnit,
      materialCode: c.Price !== undefined ? c.Component : undefined,
    })),
  ];

  const operations: ValidatedOperation[] = (raw.Operations ?? []).map((o) => ({
    opId: o.Operation,
    partId: o.Component,
    name: o.Description,
    machineTime: num(o.MachineTime),
    labourTime: num(o.LabourTime),
  }));

  const percent = num(raw.Rates.OverheadPercent, 0);
  const overhead: OverheadRule =
    percent > 0 ? { type: 'percentage', percent, base: 'conversion' } : { type: 'none' };

  return {
    product: { code: raw.Material, name: raw.MaterialDescription, currency },
    materials,
    parts,
    operations,
    namedRates: [],
    rates: {
      labourRate: num(raw.Rates.LabourRate),
      machineRate: num(raw.Rates.MachineRate),
      overhead,
      currency,
    },
  };
}
