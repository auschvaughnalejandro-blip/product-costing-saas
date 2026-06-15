import type { CostBreakdown, CostResult } from '@costing/shared';
import { describeOverhead, formatMoney } from '../lib/format';

const COMPONENTS: { key: keyof CostBreakdown; label: string; color: string }[] = [
  { key: 'material', label: 'Material', color: '#2563eb' },
  { key: 'labour', label: 'Labour', color: '#16a34a' },
  { key: 'machine', label: 'Machine', color: '#d97706' },
  { key: 'overhead', label: 'Overhead', color: '#7c3aed' },
];

export function SummaryPanel({ result }: { result: CostResult }) {
  const { total, currency } = result;
  const totalNum = Number(total.total) || 1;

  return (
    <aside className="summary card">
      <h3 className="summary-title">Cost summary</h3>

      <div className="summary-total">
        <span className="muted">Total cost to make</span>
        <span className="summary-total-value">{formatMoney(total.total, currency)}</span>
      </div>

      <div className="summary-bar">
        {COMPONENTS.map((c) => {
          const pct = (Number(total[c.key]) / totalNum) * 100;
          return pct > 0 ? (
            <div
              key={c.key}
              className="summary-bar-seg"
              style={{ width: `${pct}%`, background: c.color }}
              title={`${c.label}: ${pct.toFixed(1)}%`}
            />
          ) : null;
        })}
      </div>

      <ul className="summary-list">
        {COMPONENTS.map((c) => (
          <li key={c.key}>
            <span className="summary-dot" style={{ background: c.color }} />
            <span className="summary-label">{c.label}</span>
            <span className="summary-value">{formatMoney(total[c.key], currency)}</span>
          </li>
        ))}
        <li className="summary-grand">
          <span className="summary-label">Total</span>
          <span className="summary-value">{formatMoney(total.total, currency)}</span>
        </li>
      </ul>

      <div className="summary-meta muted">
        Overhead: {describeOverhead(result.meta.overhead)} · rounded half-up to{' '}
        {result.meta.roundingDecimals} dp
      </div>
    </aside>
  );
}
