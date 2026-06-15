import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ValidationProblem } from '@costing/shared';
import * as api from '../lib/api';

/**
 * Pull a material from SAP and cost it through the SAME engine as Excel. SAP is a
 * second data source — the resulting product is indistinguishable downstream.
 * Bad SAP data is shown as a structured problem list (the AI can suggest a fix,
 * just like for Excel); an unreachable SAP shows a plain message.
 */
export function SapImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [material, setMaterial] = useState('');
  const [errors, setErrors] = useState<ValidationProblem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<api.FixSuggestion | null>(null);
  const [fixBusy, setFixBusy] = useState(false);

  const suggestFix = async () => {
    if (!errors) return;
    setFixBusy(true);
    setFix(null);
    try {
      setFix(await api.assistantSuggestFix(errors));
    } catch (err) {
      setFix({
        enabled: false,
        summary: err instanceof api.ApiClientError ? err.message : 'Could not get a suggestion.',
      });
    } finally {
      setFixBusy(false);
    }
  };

  const submit = async () => {
    const code = material.trim();
    if (!code) return;
    setBusy(true);
    setErrors(null);
    setMessage(null);
    setFix(null);
    try {
      const result = await api.importFromSap(code);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
      navigate(`/products/${result.productId}`);
    } catch (err) {
      setMessage(err instanceof api.ApiClientError ? err.message : 'SAP import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import a product from SAP</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="muted">
          Enter the SAP material number. Its bill of materials, routing and rates are pulled from
          S/4HANA and costed through the same engine as an uploaded spreadsheet.
        </p>

        <input
          type="text"
          placeholder="Material number (e.g. WIDGET)"
          value={material}
          onChange={(e) => {
            setMaterial(e.target.value);
            setErrors(null);
            setMessage(null);
            setFix(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />

        {message && <div className="alert alert-danger">{message}</div>}

        {errors && (
          <div className="alert alert-warning" style={{ marginTop: 12 }}>
            <strong>SAP returned data we couldn't use. {errors.length} problem(s):</strong>
            <table className="problems-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Column</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.sheet}</td>
                    <td>{e.column ?? '—'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={suggestFix} disabled={fixBusy}>
                {fixBusy ? 'Asking the assistant…' : '✦ Explain these with AI'}
              </button>
            </div>
          </div>
        )}

        {fix && (
          <div className="assistant-fix">
            <p style={{ marginTop: 0 }}>{fix.summary}</p>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!material.trim() || busy} onClick={submit}>
            {busy ? 'Importing…' : 'Import & cost'}
          </button>
        </div>
      </div>
    </div>
  );
}
