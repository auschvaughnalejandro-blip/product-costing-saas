import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import { formatMoney } from '../lib/format';

interface Props {
  versionId: string;
  costTotal: string;
  currency: string;
  onClose: () => void;
}

/** Build a quotation from a saved cost version. Cost is fixed (from the engine);
 *  only the margin and customer details are entered here. */
export function QuotationDialog({ versionId, costTotal, currency, onClose }: Props) {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [marginType, setMarginType] = useState<api.MarginType>('percent');
  const [marginValue, setMarginValue] = useState('20');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display-only preview; the server computes the authoritative price.
  const cost = Number(costTotal) || 0;
  const mv = Number(marginValue) || 0;
  const previewPrice = marginType === 'percent' ? cost * (1 + mv / 100) : cost + mv;

  const submit = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const quote = await api.createQuotation({
        costVersionId: versionId,
        customerName,
        customerContact: customerContact || undefined,
        customerAddress: customerAddress || undefined,
        marginType,
        marginValue,
        terms: terms || undefined,
        notes: notes || undefined,
      });
      onClose();
      navigate(`/quotations/${quote.id}`);
    } catch (err) {
      setError(err instanceof api.ApiClientError ? err.message : 'Could not create quotation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create quotation</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted">
          Cost <strong>{formatMoney(costTotal, currency)}</strong> is fixed from this costing.
          Margin is applied on top to get the price.
        </p>

        <div className="field">
          <label>Customer name</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoFocus />
        </div>
        <div className="rates-grid">
          <div className="field">
            <label>Contact</label>
            <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          </div>
        </div>
        <div className="rates-grid">
          <div className="field">
            <label>Margin type</label>
            <select
              value={marginType}
              onChange={(e) => setMarginType(e.target.value as api.MarginType)}
            >
              <option value="percent">Percentage (%)</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          <div className="field">
            <label>Margin {marginType === 'percent' ? '(%)' : `(${currency})`}</label>
            <input
              type="number"
              min="0"
              step="any"
              value={marginValue}
              onChange={(e) => setMarginValue(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Terms</label>
          <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 30" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="price-preview">
          <span>Estimated price</span>
          <strong>{formatMoney(previewPrice, currency)}</strong>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create quotation'}
          </button>
        </div>
      </div>
    </div>
  );
}
