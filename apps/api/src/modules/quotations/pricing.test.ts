import { describe, expect, it } from 'vitest';
import { computePrice } from './pricing';

describe('pricing (cost + margin = price)', () => {
  it('applies a percentage margin, decimal-safely', () => {
    const r = computePrice('108.00', 'percent', 25);
    expect(r.marginAmount).toBe('27.00');
    expect(r.price).toBe('135.00');
  });

  it('applies a fixed-amount margin', () => {
    const r = computePrice('108.00', 'amount', 50);
    expect(r.marginAmount).toBe('50.00');
    expect(r.price).toBe('158.00');
  });

  it('rounds the price half-up to 2 decimals', () => {
    // 100 * 12.345% = 12.345 → margin 12.35 (half-up); price 112.35
    const r = computePrice('100', 'percent', '12.345');
    expect(r.marginAmount).toBe('12.35');
    expect(r.price).toBe('112.35');
  });

  it('handles zero margin', () => {
    const r = computePrice('108.00', 'percent', 0);
    expect(r.price).toBe('108.00');
  });
});
