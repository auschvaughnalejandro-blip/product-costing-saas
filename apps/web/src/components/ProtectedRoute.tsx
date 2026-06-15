import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="centered">
        <span className="badge">Loading…</span>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
