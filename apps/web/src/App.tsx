import { useQuery } from '@tanstack/react-query';
import { getHealth } from './lib/api';

/**
 * Phase 0 shell: proves the browser → API → browser round trip works.
 * Replaced by the routed application shell in Phase 5.
 */
export function App() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  return (
    <main className="centered">
      <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ marginTop: 0 }}>Product Costing</h1>
        <p className="muted">Foundations are in place. Checking the API connection…</p>
        <div style={{ marginTop: 16 }}>
          {isLoading && <span className="badge">Connecting…</span>}
          {isError && (
            <span className="badge badge-danger">
              API unreachable: {(error as Error).message}
            </span>
          )}
          {data && (
            <span className="badge badge-success">
              {data.service} is {data.status} · v{data.version}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
