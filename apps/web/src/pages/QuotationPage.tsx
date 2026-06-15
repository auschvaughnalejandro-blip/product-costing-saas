import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as api from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';

export function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.getQuotation(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="card">Loading quotation…</div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="page">
        <div className="alert alert-danger">{(error as Error)?.message ?? 'Quotation not found.'}</div>
        <Link to="/quotations">← Back to quotations</Link>
      </div>
    );
  }

  const q = data.quotation;
  const productName = data.version?.result.tree.name ?? 'Product';
  const marginAmount = (Number(q.priceTotal) - Number(q.costTotal)).toFixed(2);
  const marginLabel =
    q.marginType === 'percent' ? `${q.marginValue}%` : formatMoney(q.marginValue, q.currency);

  return (
    <div className="page">
      <div className="no-print breadcrumb">
        <Link to="/quotations">Quotations</Link> <span className="muted">/</span> {q.number}
      </div>
      <div className="no-print page-header">
        <div>
          <h1>Quotation {q.number}</h1>
          <p className="muted">
            Traceable to cost version ·{' '}
            {data.version && (
              <Link to={`/products/${data.version.productId}/versions/${q.costVersionId}`}>
                view costing
              </Link>
            )}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <div className="card quote-doc">
        <div className="quote-head">
          <div>
            <h2 style={{ margin: 0 }}>Quotation</h2>
            <div className="muted">{q.number}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>Product Costing</strong>
            <div className="muted">Prepared {formatDateTime(q.createdAt)}</div>
          </div>
        </div>

        <div className="quote-parties">
          <div>
            <div className="muted">Prepared for</div>
            <strong>{q.customerName}</strong>
            {q.customerContact && <div>{q.customerContact}</div>}
            {q.customerAddress && <div>{q.customerAddress}</div>}
          </div>
        </div>

        <table className="data-table quote-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Cost to make</th>
              <th style={{ textAlign: 'right' }}>Margin</th>
              <th style={{ textAlign: 'right' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{productName}</td>
              <td className="num">{formatMoney(q.costTotal, q.currency)}</td>
              <td className="num">
                {marginLabel} ({formatMoney(marginAmount, q.currency)})
              </td>
              <td className="num strong">{formatMoney(q.priceTotal, q.currency)}</td>
            </tr>
          </tbody>
        </table>

        <div className="quote-total">
          <span>Total price</span>
          <strong>{formatMoney(q.priceTotal, q.currency)}</strong>
        </div>

        {q.terms && (
          <div className="quote-block">
            <div className="muted">Terms</div>
            {q.terms}
          </div>
        )}
        {q.notes && (
          <div className="quote-block">
            <div className="muted">Notes</div>
            {q.notes}
          </div>
        )}

        <div className="muted quote-foot">
          Cost figures are produced by the deterministic costing engine and trace to a saved cost
          version. Price = cost + margin.
        </div>
      </div>
    </div>
  );
}
