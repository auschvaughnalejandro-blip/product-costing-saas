import type { OverheadRule, Rates } from '@costing/shared';

interface Props {
  rates: Rates;
  changedRates: boolean;
  onLabourRate: (value: string) => void;
  onMachineRate: (value: string) => void;
  onOverhead: (rule: OverheadRule) => void;
}

export function RatesPanel({ rates, changedRates, onLabourRate, onMachineRate, onOverhead }: Props) {
  const oh = rates.overhead;

  const setType = (type: OverheadRule['type']) => {
    if (type === 'percentage') {
      onOverhead({
        type: 'percentage',
        percent: oh.type === 'percentage' ? oh.percent : 0,
        base: oh.type === 'percentage' ? oh.base : 'conversion',
      });
    } else if (type === 'fixed') {
      onOverhead({ type: 'fixed', amount: oh.type === 'fixed' ? oh.amount : 0 });
    } else {
      onOverhead({ type: 'none' });
    }
  };

  return (
    <div className={`card rates-panel ${changedRates ? 'is-changed' : ''}`}>
      <h3 className="summary-title">Rates {changedRates && <span className="dot-changed" />}</h3>

      <div className="rates-grid">
        <label className="rate-field">
          <span>Labour rate</span>
          <input
            type="number"
            min="0"
            step="any"
            value={String(rates.labourRate)}
            onChange={(e) => onLabourRate(e.target.value)}
          />
        </label>
        <label className="rate-field">
          <span>Machine rate</span>
          <input
            type="number"
            min="0"
            step="any"
            value={String(rates.machineRate)}
            onChange={(e) => onMachineRate(e.target.value)}
          />
        </label>
      </div>

      <div className="rates-grid">
        <label className="rate-field">
          <span>Overhead</span>
          <select value={oh.type} onChange={(e) => setType(e.target.value as OverheadRule['type'])}>
            <option value="none">None</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>

        {oh.type === 'percentage' && (
          <label className="rate-field">
            <span>Percent (%)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={String(oh.percent)}
              onChange={(e) => onOverhead({ ...oh, percent: e.target.value })}
            />
          </label>
        )}
        {oh.type === 'fixed' && (
          <label className="rate-field">
            <span>Amount</span>
            <input
              type="number"
              min="0"
              step="any"
              value={String(oh.amount)}
              onChange={(e) => onOverhead({ type: 'fixed', amount: e.target.value })}
            />
          </label>
        )}
      </div>

      {oh.type === 'percentage' && (
        <label className="rate-field">
          <span>Applied to</span>
          <select
            value={oh.base ?? 'conversion'}
            onChange={(e) => onOverhead({ ...oh, base: e.target.value as never })}
          >
            <option value="conversion">Conversion (labour + machine)</option>
            <option value="material">Material</option>
            <option value="prime">Prime (material + labour)</option>
            <option value="total">Total</option>
          </select>
        </label>
      )}
    </div>
  );
}
