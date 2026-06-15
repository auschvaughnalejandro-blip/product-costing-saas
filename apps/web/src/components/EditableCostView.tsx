import { useMemo, useState } from 'react';
import type { CostInput, CostResult, OverheadRule } from '@costing/shared';
import * as api from '../lib/api';
import { formatMoney } from '../lib/format';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { changedQuantities, findBomNode, indexCostNodes } from '../lib/tree';
import { EditableCostTree } from './EditableCostTree';
import { RatesPanel } from './RatesPanel';
import { SummaryPanel } from './SummaryPanel';

interface Props {
  initialInput: CostInput;
  initialResult: CostResult;
  /** Extra controls rendered in the action bar (e.g. Save version in Phase 7). */
  renderActions?: (ctx: { input: CostInput; result: CostResult; dirty: boolean }) => React.ReactNode;
}

/**
 * The editable, live-recalculating cost view. Every edit changes the engine
 * INPUT and re-asks the API (which calls the same engine). There is exactly one
 * source of cost truth for the first view and every what-if.
 */
export function EditableCostView({ initialInput, initialResult, renderActions }: Props) {
  const [input, setInput] = useState<CostInput>(initialInput);
  const [result, setResult] = useState<CostResult>(initialResult);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recalc = useDebouncedCallback(async (inp: CostInput) => {
    setBusy(true);
    setRecalcError(null);
    try {
      setResult(await api.recalculate(inp));
    } catch (err) {
      setRecalcError(err instanceof api.ApiClientError ? err.message : 'Could not recalculate.');
    } finally {
      setBusy(false);
    }
  }, 350);

  const apply = (mutate: (draft: CostInput) => void) => {
    setInput((prev) => {
      const next = structuredClone(prev);
      mutate(next);
      recalc(next);
      return next;
    });
  };

  const setQuantity = (id: string, v: string) =>
    apply((d) => {
      const node = findBomNode(d.product, id);
      if (node) node.quantity = v;
    });
  const setMaterialPrice = (mat: string, v: string) =>
    apply((d) => {
      if (d.rates.materials[mat]) d.rates.materials[mat].unitPrice = v;
    });
  const setLabourRate = (v: string) => apply((d) => void (d.rates.labourRate = v));
  const setMachineRate = (v: string) => apply((d) => void (d.rates.machineRate = v));
  const setOverhead = (rule: OverheadRule) => apply((d) => void (d.rates.overhead = rule));

  const reset = () => {
    setInput(initialInput);
    setResult(initialResult);
    setRecalcError(null);
  };

  const dirty = useMemo(
    () => JSON.stringify(input) !== JSON.stringify(initialInput),
    [input, initialInput],
  );
  const costIndex = useMemo(() => indexCostNodes(result.tree), [result]);
  const changedQtys = useMemo(
    () => changedQuantities(input.product, initialInput.product),
    [input, initialInput],
  );
  const changedMaterials = useMemo(() => {
    const set = new Set<string>();
    for (const code of Object.keys(input.rates.materials)) {
      const now = String(input.rates.materials[code]?.unitPrice);
      const before = String(initialInput.rates.materials[code]?.unitPrice);
      if (now !== before) set.add(code);
    }
    return set;
  }, [input, initialInput]);
  const changedRates = useMemo(() => {
    const a = input.rates;
    const b = initialInput.rates;
    return (
      String(a.labourRate) !== String(b.labourRate) ||
      String(a.machineRate) !== String(b.machineRate) ||
      JSON.stringify(a.overhead) !== JSON.stringify(b.overhead)
    );
  }, [input, initialInput]);

  const currency = result.currency;

  return (
    <>
      <div className="action-bar">
        {dirty ? (
          <>
            <span className="badge badge-warning">Unsaved changes</span>
            {initialResult.total.total !== result.total.total && (
              <span className="muted">
                Total {formatMoney(initialResult.total.total, currency)} →{' '}
                <strong>{formatMoney(result.total.total, currency)}</strong>
              </span>
            )}
            {busy && <span className="muted">recalculating…</span>}
            <button className="btn btn-sm" onClick={reset}>
              Reset changes
            </button>
          </>
        ) : (
          <span className="muted">Edit any quantity or rate to see the cost update live.</span>
        )}
        <div className="action-bar-right">{renderActions?.({ input, result, dirty })}</div>
      </div>

      {recalcError && <div className="alert alert-danger">{recalcError}</div>}

      <div className="cost-layout">
        <div className="edit-main">
          <RatesPanel
            rates={input.rates}
            changedRates={changedRates}
            onLabourRate={setLabourRate}
            onMachineRate={setMachineRate}
            onOverhead={setOverhead}
          />
          <div className="card no-pad">
            <EditableCostTree
              bom={input.product}
              costIndex={costIndex}
              materials={input.rates.materials}
              currency={currency}
              changedQtys={changedQtys}
              changedMaterials={changedMaterials}
              onQuantity={setQuantity}
              onMaterialPrice={setMaterialPrice}
            />
          </div>
        </div>
        <SummaryPanel result={result} />
      </div>
    </>
  );
}
