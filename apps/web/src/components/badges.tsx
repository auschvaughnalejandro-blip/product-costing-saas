import type { CostVersionKind, CostVersionStatus } from '../lib/api';

export function KindBadge({ kind }: { kind: CostVersionKind }) {
  return <span className={`badge ${kind === 'final' ? 'badge-final' : ''}`}>{kind}</span>;
}

const STATUS_CLASS: Record<CostVersionStatus, string> = {
  draft: '',
  submitted: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

export function StatusBadge({ status }: { status: CostVersionStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{status}</span>;
}
