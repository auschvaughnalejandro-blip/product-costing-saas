import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { CostInput } from '@costing/shared';
import * as api from '../lib/api';
import { EditableCostView } from '../components/EditableCostView';
import { SaveVersionDialog } from '../components/SaveVersionDialog';
import { VersionsPanel } from '../components/VersionsPanel';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [saveInput, setSaveInput] = useState<CostInput | null>(null);

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
          <p className="muted">Editable cost breakdown · {result.currency}</p>
        </div>
      </div>

      <EditableCostView
        initialInput={data.input}
        initialResult={result}
        renderActions={({ input }) => (
          <button className="btn btn-primary btn-sm" onClick={() => setSaveInput(input)}>
            Save version
          </button>
        )}
      />

      <VersionsPanel productId={id!} />

      {saveInput && id && (
        <SaveVersionDialog productId={id} input={saveInput} onClose={() => setSaveInput(null)} />
      )}
    </div>
  );
}
