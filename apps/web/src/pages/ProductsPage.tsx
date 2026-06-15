import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatDateTime } from '../lib/format';
import { UploadDialog } from '../components/UploadDialog';

export function ProductsPage() {
  const [showUpload, setShowUpload] = useState(false);
  const { data: products, isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: api.listProducts,
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="muted">Upload a spreadsheet to cost a product, or open a saved one.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          Upload spreadsheet
        </button>
      </div>

      {isLoading && <div className="card">Loading…</div>}
      {isError && <div className="alert alert-danger">Couldn't load products.</div>}

      {products && products.length === 0 && (
        <div className="card empty-state">
          <h3>No products yet</h3>
          <p className="muted">Upload your first spreadsheet to see a full cost breakdown.</p>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            Upload spreadsheet
          </button>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="card no-pad">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Currency</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.code}</code>
                  </td>
                  <td>
                    <Link to={`/products/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.currency}</td>
                  <td className="muted">{formatDateTime(p.updatedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn btn-sm" to={`/products/${p.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </div>
  );
}
