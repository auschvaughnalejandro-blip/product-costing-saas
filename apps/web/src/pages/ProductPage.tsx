import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as api from '../lib/api';
import { CostTree } from '../components/CostTree';
import { SummaryPanel } from '../components/SummaryPanel';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['product-cost', id],
    queryFn: () => api.getProductCost(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="card">Loading cost breakdown…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page">
        <div className="alert alert-danger">
          {(error as Error)?.message ?? 'Could not load this product.'}
        </div>
        <Link to="/">← Back to products</Link>
      </div>
    );
  }

  const { result } = data;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/">Products</Link> <span className="muted">/</span> {result.tree.name}
      </div>

      <div className="page-header">
        <div>
          <h1>{result.tree.name}</h1>
          <p className="muted">Full cost breakdown · {result.currency}</p>
        </div>
      </div>

      <div className="cost-layout">
        <div className="card no-pad cost-main">
          <CostTree tree={result.tree} currency={result.currency} />
        </div>
        <SummaryPanel result={result} />
      </div>
    </div>
  );
}
