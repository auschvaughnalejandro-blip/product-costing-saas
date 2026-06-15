import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as api from '../lib/api';
import { CostTree } from '../components/CostTree';
import { SummaryPanel } from '../components/SummaryPanel';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { QuotationDialog } from '../components/QuotationDialog';
import { KindBadge, StatusBadge } from '../components/badges';
import { formatDateTime } from '../lib/format';

export function VersionPage() {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const [showQuote, setShowQuote] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['version', versionId],
    queryFn: () => api.getVersion(versionId!),
    enabled: Boolean(versionId),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="card">Loading version…</div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="page">
        <div className="alert alert-danger">{(error as Error)?.message ?? 'Version not found.'}</div>
        <Link to={`/products/${id}`}>← Back to product</Link>
      </div>
    );
  }

  const { version, nextActions } = data;
  const { result } = version;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/">Products</Link> <span className="muted">/</span>{' '}
        <Link to={`/products/${id}`}>{result.tree.name}</Link> <span className="muted">/</span>{' '}
        {version.name}
      </div>

      <div className="page-header">
        <div>
          <h1>
            {version.name} <KindBadge kind={version.kind} /> <StatusBadge status={version.status} />
          </h1>
          <p className="muted">
            Version {version.versionNo} · immutable snapshot · saved {formatDateTime(version.createdAt)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowQuote(true)}>
          Create quotation
        </button>
      </div>

      {showQuote && (
        <QuotationDialog
          versionId={version.id}
          costTotal={version.totalCost}
          currency={version.currency}
          onClose={() => setShowQuote(false)}
        />
      )}

      <div className="cost-layout">
        <div className="card no-pad cost-main">
          <CostTree tree={result.tree} currency={result.currency} />
        </div>
        <div className="side-col">
          <SummaryPanel result={result} />
          <ApprovalPanel versionId={version.id} status={version.status} nextActions={nextActions} />
        </div>
      </div>
    </div>
  );
}
