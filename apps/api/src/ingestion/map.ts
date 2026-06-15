/**
 * Step 3 of 3 — MAP. Convert validated data into the engine's input types and the
 * storage types. This only ever runs on data that has already passed validation.
 */
import type { BomNode, CostInput, Operation } from '@costing/shared';
import type { MaterialInput } from '../modules/materials/materials.repo';
import type { ProductDefinitionInput, ProductRateSettings } from '../modules/products/types';
import type { ValidatedData } from './validate';

export interface MappedUpload {
  materials: MaterialInput[];
  product: ProductDefinitionInput;
}

export function mapToProduct(data: ValidatedData): MappedUpload {
  // Build the BOM tree from the flat parts list.
  const nodes = new Map<string, BomNode>();
  for (const p of data.parts) {
    const node: BomNode = { id: p.nodeId, name: p.name, quantity: p.quantity };
    if (p.unit) node.unit = p.unit;
    if (p.materialCode) node.materialId = p.materialCode;
    nodes.set(p.nodeId, node);
  }
  let root: BomNode | undefined;
  for (const p of data.parts) {
    const node = nodes.get(p.nodeId)!;
    if (p.parentId) {
      const parent = nodes.get(p.parentId)!;
      (parent.children ??= []).push(node);
    } else {
      root = node;
    }
  }
  if (!root) {
    // Should be impossible after validation, but never produce a wrong product.
    throw new Error('Mapping failed: no product root in validated data.');
  }

  const routing: Operation[] = data.operations.map((o) => {
    const op: Operation = {
      id: o.opId,
      name: o.name,
      partId: o.partId,
      machineTime: o.machineTime,
      labourTime: o.labourTime,
    };
    if (o.machineRateCode) op.machineRateId = o.machineRateCode;
    if (o.labourRateCode) op.labourRateId = o.labourRateCode;
    return op;
  });

  const labourRates: Record<string, number> = {};
  const machineRates: Record<string, number> = {};
  for (const nr of data.namedRates) {
    (nr.kind === 'labour' ? labourRates : machineRates)[nr.code] = nr.rate;
  }

  const rates: ProductRateSettings = {
    labourRate: data.rates.labourRate,
    machineRate: data.rates.machineRate,
    overhead: data.rates.overhead,
    currency: data.rates.currency,
  };
  if (Object.keys(labourRates).length) rates.labourRates = labourRates;
  if (Object.keys(machineRates).length) rates.machineRates = machineRates;

  const materials: MaterialInput[] = data.materials.map((m) => ({
    code: m.code,
    name: m.name,
    unit: m.unit ?? null,
    unitPrice: m.unitPrice,
    currency: m.currency ?? data.product.currency,
    source: 'excel',
  }));

  const product: ProductDefinitionInput = {
    code: data.product.code,
    name: data.product.name,
    description: data.product.description,
    currency: data.product.currency,
    bom: root,
    routing,
    rates,
  };

  return { materials, product };
}

/**
 * Assemble engine input directly from a mapped upload — used to cost a freshly
 * uploaded product as a preview, before anything is saved.
 */
export function mappedToCostInput(mapped: MappedUpload): CostInput {
  const materials: CostInput['rates']['materials'] = {};
  for (const m of mapped.materials) {
    materials[m.code] = { unitPrice: m.unitPrice, ...(m.unit ? { unit: m.unit } : {}) };
  }
  const { rates } = mapped.product;
  return {
    product: mapped.product.bom,
    routing: mapped.product.routing,
    rates: {
      materials,
      labourRate: rates.labourRate,
      machineRate: rates.machineRate,
      overhead: rates.overhead,
      ...(rates.labourRates ? { labourRates: rates.labourRates } : {}),
      ...(rates.machineRates ? { machineRates: rates.machineRates } : {}),
      currency: rates.currency,
    },
    currency: mapped.product.currency,
  };
}
