/**
 * The costing engine — the single source of every cost figure in the product.
 *
 * It is PURE and DETERMINISTIC: it takes data in and returns numbers out, with
 * no database, no network, no clock, and no randomness. The same inputs always
 * produce the same output. This is what makes the numbers trustworthy and the
 * engine trivial to test.
 *
 * How it works (walking the BOM tree bottom-up):
 *   material = Σ (effective quantity × material price) over all levels
 *   labour   = Σ (effective quantity × operation labour time × labour rate)
 *   machine  = Σ (effective quantity × operation machine time × machine rate)
 *   overhead = applied per the overhead rule (percentage of a base, or fixed)
 *   total    = material + labour + machine + overhead
 *
 * "Effective quantity" is a node's quantity multiplied up through its ancestors,
 * so 2 frames each needing 4 bolts correctly needs 8 bolts.
 */
import type {
  BomNode,
  CostBreakdown,
  CostInput,
  CostNode,
  CostResult,
  Operation,
  OverheadBase,
  OverheadRule,
  Rates,
} from '@costing/shared';
import { Big, ZERO, money, quantity } from './decimal';
import { EngineError, type EngineErrorCode } from './errors';
import Decimal from 'decimal.js';

const MAX_DEPTH = 512;

/** Internal, fully-precise representation before rounding for output. */
interface RawNode {
  id: string;
  name: string;
  unit?: string;
  quantity: Decimal;
  eff: Decimal;
  materialId?: string;
  unitPrice?: Decimal;
  material: Decimal;
  labour: Decimal;
  machine: Decimal;
  children: RawNode[];
}

// ── number parsing ──────────────────────────────────────────────────────────

function parseNum(value: unknown, what: string, code: EngineErrorCode): Decimal {
  let d: Decimal;
  try {
    d = new Big(value as Decimal.Value);
  } catch {
    throw new EngineError(code, `${what} is not a valid number (got ${JSON.stringify(value)}).`);
  }
  if (!d.isFinite()) {
    throw new EngineError(code, `${what} must be a finite number (got ${JSON.stringify(value)}).`);
  }
  return d;
}

function parseNonNegative(value: unknown, what: string, code: EngineErrorCode = 'INVALID_VALUE'): Decimal {
  const d = parseNum(value, what, code);
  if (d.isNegative()) {
    throw new EngineError(code, `${what} must not be negative (got ${d.toString()}).`);
  }
  return d;
}

// ── validation ──────────────────────────────────────────────────────────────

function validateRates(rates: Rates | undefined): asserts rates is Rates {
  if (!rates || typeof rates !== 'object') {
    throw new EngineError('MISSING_RATES', 'No rates were provided to the engine.');
  }
  if (!rates.materials || typeof rates.materials !== 'object') {
    throw new EngineError('MISSING_RATES', 'The rates are missing the material prices table.');
  }
  validateOverhead(rates.overhead);
}

function validateOverhead(rule: OverheadRule | undefined): void {
  if (!rule || typeof rule !== 'object') {
    throw new EngineError('INVALID_OVERHEAD', 'No overhead rule was provided.');
  }
  switch (rule.type) {
    case 'none':
      return;
    case 'percentage':
      parseNonNegative(rule.percent, 'overhead percentage', 'INVALID_OVERHEAD');
      if (
        rule.base !== undefined &&
        !['material', 'conversion', 'prime', 'total'].includes(rule.base)
      ) {
        throw new EngineError('INVALID_OVERHEAD', `Unknown overhead base "${rule.base}".`);
      }
      return;
    case 'fixed':
      parseNonNegative(rule.amount, 'fixed overhead amount', 'INVALID_OVERHEAD');
      return;
    default:
      throw new EngineError(
        'INVALID_OVERHEAD',
        `Unknown overhead type "${(rule as { type?: string }).type}".`,
      );
  }
}

// ── rate resolution ───────────────────────────────────────────────────────────

function resolveLabourRate(op: Operation, rates: Rates): Decimal {
  if (op.labourRateId != null) {
    const r = rates.labourRates?.[op.labourRateId];
    if (r == null) {
      throw new EngineError(
        'MISSING_LABOUR_RATE',
        `Operation "${op.name}" needs labour rate "${op.labourRateId}", which isn't defined.`,
      );
    }
    return parseNonNegative(r, `labour rate "${op.labourRateId}"`);
  }
  if (rates.labourRate == null) {
    throw new EngineError(
      'MISSING_LABOUR_RATE',
      `Operation "${op.name}" needs a labour rate but none is set.`,
    );
  }
  return parseNonNegative(rates.labourRate, 'labour rate', 'MISSING_LABOUR_RATE');
}

function resolveMachineRate(op: Operation, rates: Rates): Decimal {
  if (op.machineRateId != null) {
    const r = rates.machineRates?.[op.machineRateId];
    if (r == null) {
      throw new EngineError(
        'MISSING_MACHINE_RATE',
        `Operation "${op.name}" needs machine rate "${op.machineRateId}", which isn't defined.`,
      );
    }
    return parseNonNegative(r, `machine rate "${op.machineRateId}"`);
  }
  if (rates.machineRate == null) {
    throw new EngineError(
      'MISSING_MACHINE_RATE',
      `Operation "${op.name}" needs a machine rate but none is set.`,
    );
  }
  return parseNonNegative(rates.machineRate, 'machine rate', 'MISSING_MACHINE_RATE');
}

// ── tree walk ─────────────────────────────────────────────────────────────────

function indexOperations(routing: Operation[]): Map<string, Operation[]> {
  const byPart = new Map<string, Operation[]>();
  for (const op of routing) {
    const list = byPart.get(op.partId);
    if (list) list.push(op);
    else byPart.set(op.partId, [op]);
  }
  return byPart;
}

function buildRaw(
  node: BomNode,
  parentEff: Decimal,
  path: Set<string>,
  seen: Set<string>,
  opsByPart: Map<string, Operation[]>,
  rates: Rates,
  depth: number,
): RawNode {
  if (!node || typeof node !== 'object') {
    throw new EngineError('INVALID_INPUT', 'A BOM node is missing or not an object.');
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new EngineError('INVALID_INPUT', `A BOM node is missing an id (name: ${node.name}).`);
  }
  if (depth > MAX_DEPTH) {
    throw new EngineError(
      'INVALID_INPUT',
      `Bill of materials is nested deeper than ${MAX_DEPTH} levels — likely a data error.`,
    );
  }
  if (path.has(node.id)) {
    throw new EngineError(
      'CIRCULAR_REFERENCE',
      `Part "${node.id}" contains itself (a circular reference), which can't be costed.`,
      { partId: node.id },
    );
  }
  if (seen.has(node.id)) {
    throw new EngineError(
      'DUPLICATE_PART_ID',
      `Part id "${node.id}" appears more than once. Every part needs a unique id.`,
      { partId: node.id },
    );
  }
  seen.add(node.id);
  path.add(node.id);

  const q = parseNonNegative(
    node.quantity,
    `quantity of part "${node.name}" (${node.id})`,
    'INVALID_QUANTITY',
  );
  const eff = parentEff.times(q);

  // Own material consumption.
  let material = ZERO;
  let unitPrice: Decimal | undefined;
  if (node.materialId != null) {
    const m = rates.materials[node.materialId];
    if (!m) {
      throw new EngineError(
        'MISSING_MATERIAL_RATE',
        `No price is defined for material "${node.materialId}", used by part "${node.name}".`,
        { materialId: node.materialId, partId: node.id },
      );
    }
    unitPrice = parseNonNegative(m.unitPrice, `unit price of material "${node.materialId}"`);
    material = eff.times(unitPrice);
  }

  // Own labour and machine from operations performed on this part.
  let labour = ZERO;
  let machine = ZERO;
  for (const op of opsByPart.get(node.id) ?? []) {
    const labourTime = parseNonNegative(op.labourTime, `labour time of operation "${op.name}"`);
    const machineTime = parseNonNegative(op.machineTime, `machine time of operation "${op.name}"`);
    labour = labour.plus(eff.times(labourTime).times(resolveLabourRate(op, rates)));
    machine = machine.plus(eff.times(machineTime).times(resolveMachineRate(op, rates)));
  }

  // Roll up children.
  const children: RawNode[] = [];
  for (const child of node.children ?? []) {
    const c = buildRaw(child, eff, path, seen, opsByPart, rates, depth + 1);
    children.push(c);
    material = material.plus(c.material);
    labour = labour.plus(c.labour);
    machine = machine.plus(c.machine);
  }

  path.delete(node.id);

  return {
    id: node.id,
    name: node.name,
    unit: node.unit,
    quantity: q,
    eff,
    materialId: node.materialId,
    unitPrice,
    material,
    labour,
    machine,
    children,
  };
}

// ── overhead ────────────────────────────────────────────────────────────────

function overheadFor(raw: RawNode, rule: OverheadRule, isRoot: boolean): Decimal {
  switch (rule.type) {
    case 'none':
      return ZERO;
    case 'fixed':
      // A fixed overhead is a product-level amount — applied once, at the root.
      return isRoot ? parseNonNegative(rule.amount, 'fixed overhead amount', 'INVALID_OVERHEAD') : ZERO;
    case 'percentage': {
      const pct = parseNonNegative(rule.percent, 'overhead percentage', 'INVALID_OVERHEAD').div(100);
      const base = selectBase(rule.base ?? 'conversion', raw);
      return base.times(pct);
    }
    default:
      return ZERO;
  }
}

function selectBase(base: OverheadBase, raw: RawNode): Decimal {
  switch (base) {
    case 'material':
      return raw.material;
    case 'conversion':
      return raw.labour.plus(raw.machine);
    case 'prime':
      return raw.material.plus(raw.labour);
    case 'total':
      return raw.material.plus(raw.labour).plus(raw.machine);
    default:
      return raw.labour.plus(raw.machine);
  }
}

// ── formatting (round for output) ────────────────────────────────────────────

function format(raw: RawNode, rule: OverheadRule, isRoot: boolean): CostNode {
  const overhead = overheadFor(raw, rule, isRoot);
  const total = raw.material.plus(raw.labour).plus(raw.machine).plus(overhead);
  const cost: CostBreakdown = {
    material: money(raw.material),
    labour: money(raw.labour),
    machine: money(raw.machine),
    overhead: money(overhead),
    total: money(total),
  };
  return {
    id: raw.id,
    name: raw.name,
    unit: raw.unit,
    quantity: quantity(raw.quantity),
    effectiveQuantity: quantity(raw.eff),
    materialId: raw.materialId,
    unitMaterialPrice: raw.unitPrice ? money(raw.unitPrice) : undefined,
    cost,
    children: raw.children.map((c) => format(c, rule, false)),
  };
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Cost a single product. Returns the full breakdown at every level, or throws
 * an {@link EngineError} (never a wrong number) when the inputs are invalid.
 */
export function computeCost(input: CostInput): CostResult {
  if (!input || typeof input !== 'object') {
    throw new EngineError('INVALID_INPUT', 'No costing input was provided.');
  }
  if (!input.product) {
    throw new EngineError('INVALID_INPUT', 'The costing input has no product (bill of materials).');
  }
  validateRates(input.rates);

  const routing = Array.isArray(input.routing) ? input.routing : [];
  const opsByPart = indexOperations(routing);
  const seen = new Set<string>();

  const raw = buildRaw(input.product, new Big(1), new Set<string>(), seen, opsByPart, input.rates, 0);

  // Every operation must point at a part that exists — otherwise its cost would
  // silently vanish, which would be a wrong number.
  for (const op of routing) {
    if (!seen.has(op.partId)) {
      throw new EngineError(
        'UNKNOWN_OPERATION_PART',
        `Operation "${op.name}" refers to part "${op.partId}", which isn't in the bill of materials.`,
        { operationId: op.id, partId: op.partId },
      );
    }
  }

  const tree = format(raw, input.rates.overhead, true);
  const currency = input.currency ?? input.rates.currency ?? 'USD';

  return {
    currency,
    total: tree.cost,
    tree,
    meta: {
      roundingDecimals: 2,
      rounding: 'half-up',
      overhead: input.rates.overhead,
    },
  };
}
