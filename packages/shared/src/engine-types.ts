/**
 * Costing engine input/output types.
 *
 * These are the contract between everything that *produces* product data
 * (Excel ingestion, the API, SAP later) and the one thing that *computes*
 * cost (the engine). Excel and SAP both map onto these exact types so the
 * engine never has to care where the data came from.
 */
import type { Money, Numeric } from './common';

// ─────────────────────────────── Inputs ───────────────────────────────

/**
 * A node in the bill of materials (a part). Parts may contain sub-parts,
 * making the BOM a multi-level tree.
 */
export interface BomNode {
  /** Unique id within the product. */
  id: string;
  name: string;
  /**
   * Quantity of this node required per ONE unit of its parent.
   * For the root product this is the lot size (default 1).
   */
  quantity: Numeric;
  /** Optional unit of measure, for display only (e.g. "pcs", "kg"). */
  unit?: string;
  /**
   * If set, this node consumes the referenced material. The amount consumed is
   * the node's effective quantity (its quantity multiplied up through the tree).
   */
  materialId?: string;
  /** Sub-parts of this node. */
  children?: BomNode[];
}

/**
 * A routing operation: work performed on a specific part. Labour and machine
 * costs come from these.
 */
export interface Operation {
  id: string;
  name: string;
  /** The BOM node (by id) this operation is performed on. */
  partId: string;
  /** Machine time per unit of the part, in the rate's time unit (e.g. hours). */
  machineTime: Numeric;
  /** Labour time per unit of the part. */
  labourTime: Numeric;
  /** Optional: pick a named machine rate from `Rates.machineRates`. */
  machineRateId?: string;
  /** Optional: pick a named labour rate from `Rates.labourRates`. */
  labourRateId?: string;
}

/** A material price (master data — entered by the user or pulled from SAP). */
export interface MaterialRate {
  unitPrice: Numeric;
  unit?: string;
  description?: string;
}

/** What the overhead percentage is applied to. */
export type OverheadBase = 'material' | 'conversion' | 'prime' | 'total';

/**
 * How overhead is applied:
 * - `none`     — no overhead.
 * - `percentage` — a percentage of a chosen base (default: conversion = labour + machine).
 * - `fixed`    — a fixed amount applied once, at the product (root) level.
 */
export type OverheadRule =
  | { type: 'none' }
  | { type: 'percentage'; percent: Numeric; base?: OverheadBase }
  | { type: 'fixed'; amount: Numeric };

/** The rates table — all the master data needed to turn structure into cost. */
export interface Rates {
  /** Material prices keyed by material id. */
  materials: Record<string, MaterialRate>;
  /** Default labour cost per time unit. */
  labourRate: Numeric;
  /** Default machine cost per time unit. */
  machineRate: Numeric;
  /** Optional named labour rates (e.g. per skill/workcentre). */
  labourRates?: Record<string, Numeric>;
  /** Optional named machine rates (e.g. per workcentre). */
  machineRates?: Record<string, Numeric>;
  overhead: OverheadRule;
  /** Currency label for all figures (display only). */
  currency?: string;
}

/** Everything the engine needs to cost one product. */
export interface CostInput {
  product: BomNode;
  routing: Operation[];
  rates: Rates;
  /** Overrides `rates.currency`. Display only. */
  currency?: string;
}

// ─────────────────────────────── Outputs ──────────────────────────────

/** The five figures that make up a cost, all decimal-safe money strings. */
export interface CostBreakdown {
  material: Money;
  labour: Money;
  machine: Money;
  overhead: Money;
  total: Money;
}

/** A costed node — mirrors a BomNode, with the cost of its whole subtree. */
export interface CostNode {
  id: string;
  name: string;
  unit?: string;
  /** Quantity per parent, as supplied. */
  quantity: string;
  /** Quantity needed for the whole product (quantity multiplied up the tree). */
  effectiveQuantity: string;
  materialId?: string;
  /** Unit price used for this node's own material, if any (display). */
  unitMaterialPrice?: Money;
  /** Cost of this node including everything beneath it. */
  cost: CostBreakdown;
  children: CostNode[];
}

/** The complete, deterministic result of costing a product. */
export interface CostResult {
  currency: string;
  /** Product-level totals (identical to `tree.cost`). */
  total: CostBreakdown;
  /** The full cost tree, root first. */
  tree: CostNode;
  /** How the numbers were produced — for transparency in the UI and the AI. */
  meta: {
    roundingDecimals: number;
    rounding: 'half-up';
    overhead: OverheadRule;
  };
}
