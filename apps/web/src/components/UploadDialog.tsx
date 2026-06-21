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
  const [progress, setProgress] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
    if (!file) return;
    setBusy(true);
    setErrors(null);
    setMessage(null);
    setSuccess(null);
    setProgress(0);
    try {
      const result = await api.uploadExcel(file, { onProgress: setProgress });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      // Confirm the file was received and costed before whisking the user away.
      setSuccess('File received and costed successfully. Opening it now…');
      await qc.invalidateQueries({ queryKey: ['products'] });
      setTimeout(() => {
        onClose();
        navigate(`/products/${result.productId}`);
      }, 900);
    } catch (err) {
      setMessage(err instanceof api.ApiClientError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      setProgress(null);
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
            setSuccess(null);
            setFix(null);
          }}
        />

        {busy && progress !== null && (
          <div style={{ marginTop: 12 }}>
            <div className="progress" role="progressbar" aria-valuenow={progress}>
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {progress < 100 ? `Uploading… ${progress}%` : 'Processing on the server…'}
            </p>
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginTop: 12 }}>
            {success}
          </div>
        )}

        {message && (
          <div className="alert alert-danger" style={{ marginTop: 12 }}>
            {message}
          </div>
        )}

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
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={suggestFix} disabled={fixBusy}>
                {fixBusy ? 'Asking the assistant…' : '✦ Suggest a fix with AI'}
              </button>
            </div>
          </div>
        )}

        {fix && (
          <div className="assistant-fix">
            <p style={{ marginTop: 0 }}>{fix.summary}</p>
            {fix.fileBase64 && (
              <p>
                <a
                  className="btn btn-primary btn-sm"
                  download={fix.filename ?? 'corrected.xlsx'}
                  href={`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${fix.fileBase64}`}
                >
                  Download corrected file
                </a>{' '}
                <span className="muted">— review it, then re-upload above to apply.</span>
              </p>
            )}
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
