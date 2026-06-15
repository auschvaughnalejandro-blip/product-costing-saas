import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ValidationProblem } from '@costing/shared';
import * as api from '../lib/api';

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationProblem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErrors(null);
    setMessage(null);
    try {
      const result = await api.uploadExcel(file);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
      navigate(`/products/${result.productId}`);
    } catch (err) {
      setMessage(err instanceof api.ApiClientError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload product spreadsheet</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="muted">
          Upload an <code>.xlsx</code> file in the expected format. New to it?{' '}
          <a href={api.templateUrl}>Download the template</a> (it includes a worked example).
        </p>

        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors(null);
            setMessage(null);
          }}
        />

        {message && <div className="alert alert-danger">{message}</div>}

        {errors && (
          <div className="alert alert-warning" style={{ marginTop: 12 }}>
            <strong>The file couldn't be used. Please fix these {errors.length} problem(s):</strong>
            <table className="problems-table">
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Row</th>
                  <th>Column</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.sheet}</td>
                    <td>{e.row ?? '—'}</td>
                    <td>{e.column ?? '—'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!file || busy} onClick={submit}>
            {busy ? 'Uploading…' : 'Upload & cost'}
          </button>
        </div>
      </div>
    </div>
  );
}
