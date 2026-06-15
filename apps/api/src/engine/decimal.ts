/**
 * Decimal-safe money. The engine does ALL arithmetic through this configured
 * Decimal constructor — never with JavaScript's floating-point numbers — so we
 * never get classic money bugs like 0.1 + 0.2 = 0.30000000000000004.
 *
 * Rounding rule (explicit and consistent across the whole product):
 *   every output cost figure is rounded HALF-UP to 2 decimal places.
 * Internal computation keeps full precision; rounding happens only when a
 * figure is emitted.
 */
import Decimal from 'decimal.js';

export const MONEY_DECIMALS = 2;

/**
 * A Decimal constructor pinned to deterministic settings. `precision` is the
 * number of significant digits kept internally; HALF_UP is the rounding mode
 * used by `toFixed`.
 */
export const Big = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -15,
  toExpPos: 40,
});

export type Big = Decimal;

export const ZERO = new Big(0);

/** Round a Decimal to a 2-dp money string, e.g. "108.00". */
export function money(value: Decimal): string {
  return value.toFixed(MONEY_DECIMALS);
}

/** Render a quantity as a clean string without exponential notation. */
export function quantity(value: Decimal): string {
  return value.toString();
}
