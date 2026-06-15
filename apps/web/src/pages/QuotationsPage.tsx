import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';

export function QuotationsPage() {
  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: api.listQuotations,
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Quotations</h1>
          <p className="muted">Customer quotes generated from saved costings.</p>
        </div>
      </div>

      {isLoading && <div className="card">Loading…</div>}
      {quotations && quotations.length === 0 && (
        <div className="card empty-state">
          <h3>No quotations yet</h3>
          <p className="muted">
            Open a product, save a cost version, then create a quotation from it.
          </p>
        </div>
      )}

      {quotations && quotations.length > 0 && (
        <div className="card no-pad">
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link to={`/quotations/${q.id}`}>
                      <code>{q.number}</code>
                    </Link>
                  </td>
                  <td>{q.customerName}</td>
                  <td className="num muted">{formatMoney(q.costTotal, q.currency)}</td>
                  <td className="num strong">{formatMoney(q.priceTotal, q.currency)}</td>
                  <td className="muted">{formatDateTime(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
