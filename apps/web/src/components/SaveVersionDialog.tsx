import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CostInput } from '@costing/shared';
import * as api from '../lib/api';

export function SaveVersionDialog({
  productId,
  input,
  onClose,
}: {
  productId: string;
  input: CostInput;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<api.CostVersionKind>('draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createVersion(productId, { name: name.trim() || 'Untitled version', kind, input });
      await qc.invalidateQueries({ queryKey: ['versions', productId] });
      onClose();
    } catch (err) {
      setError(err instanceof api.ApiClientError ? err.message : 'Could not save version.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save cost version</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted">
          A version is an immutable snapshot of the current figures — including any edits you've
          made. Finals can't be silently changed later.
        </p>

        <div className="field">
          <label htmlFor="vname">Name</label>
          <input
            id="vname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q3 estimate"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="vkind">Type</label>
          <select
            id="vkind"
            value={kind}
            onChange={(e) => setKind(e.target.value as api.CostVersionKind)}
          >
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </select>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save version'}
          </button>
        </div>
      </div>
    </div>
  );
}
