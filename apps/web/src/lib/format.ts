/**
 * The single place that formats money, quantities, and percentages for display.
 * The authoritative values are the decimal strings the engine returns; these
 * helpers only make them readable. Nothing here changes a number.
 */

export function formatMoney(value: string | number, currency = 'USD'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Format a quantity, trimming pointless trailing zeros (e.g. "2", "0.5"). */
export function formatQuantity(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(n);
}

export function formatPercent(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)}%`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Describe an overhead rule in one short phrase. */
export function describeOverhead(overhead: {
  type: string;
  percent?: string | number;
  base?: string;
  amount?: string | number;
}): string {
  if (overhead.type === 'percentage') {
    return `${formatPercent(overhead.percent ?? 0)} of ${overhead.base ?? 'conversion'}`;
  }
  if (overhead.type === 'fixed') return `fixed amount`;
  return 'none';
}
