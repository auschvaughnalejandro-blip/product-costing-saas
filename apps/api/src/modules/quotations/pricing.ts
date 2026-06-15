/**
 * Pricing — turning COST (what it costs to make, from the engine) into PRICE
 * (what you charge) by applying a margin on top. This is deliberately separate
 * from the costing engine: the engine never knows about margin or price.
 *
 * It is still decimal-safe (no floating-point money bugs): it reuses the same
 * Decimal helpers the engine uses.
 */
import { Big, money } from '../../engine/decimal';
import type { Numeric } from '@costing/shared';

export type MarginType = 'percent' | 'amount';

export interface PriceResult {
  /** The margin in money terms. */
  marginAmount: string;
  /** Cost + margin. */
  price: string;
}

export function computePrice(
  costTotal: Numeric,
  marginType: MarginType,
  marginValue: Numeric,
): PriceResult {
  const cost = new Big(costTotal);
  const mv = new Big(marginValue);
  const marginAmount = marginType === 'percent' ? cost.times(mv).div(100) : mv;
  return {
    marginAmount: money(marginAmount),
    price: money(cost.plus(marginAmount)),
  };
}
