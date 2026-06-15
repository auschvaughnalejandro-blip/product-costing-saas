import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { KindBadge, StatusBadge } from './badges';

export function VersionsPanel({ productId }: { productId: string }) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['versions', productId],
    queryFn: () => api.listVersions(productId),
  });

  return (
    <div className="card">
      <h3 className="summary-title">Saved versions</h3>

      {isLoading && <p className="muted">Loading…</p>}
      {versions && versions.length === 0 && (
        <p className="muted">
          No versions yet. Use <strong>Save version</strong> above to snapshot the current costing.
        </p>
      )}

      {versions && versions.length > 0 && (
        <table className="data-table compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Saved</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.versionNo}</td>
                <td>
                  <Link to={`/products/${productId}/versions/${v.id}`}>{v.name}</Link>
                </td>
                <td>
                  <KindBadge kind={v.kind} />
                </td>
                <td>
                  <StatusBadge status={v.status} />
                </td>
                <td className="num">{formatMoney(v.totalCost, v.currency)}</td>
                <td className="muted">{formatDateTime(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
