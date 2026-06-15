import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { StatusBadge } from './badges';

const ACTION_LABEL: Record<api.ApprovalActionName, string> = {
  submit: 'Submit for approval',
  approve: 'Approve',
  reject: 'Reject',
};

/** Can the current user's role perform this action? */
function allowed(role: string, action: api.ApprovalActionName): boolean {
  if (action === 'submit') return role === 'admin' || role === 'estimator';
  return role === 'admin' || role === 'approver';
}

export function ApprovalPanel({
  versionId,
  status,
  nextActions,
}: {
  versionId: string;
  status: api.CostVersionStatus;
  nextActions: api.ApprovalActionName[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<api.ApprovalActionName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: events } = useQuery({
    queryKey: ['approvals', versionId],
    queryFn: () => api.listApprovals(versionId),
  });

  const act = async (action: api.ApprovalActionName) => {
    setBusy(action);
    setError(null);
    try {
      await api.transitionVersion(versionId, action, comment || undefined);
      setComment('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['version', versionId] }),
        qc.invalidateQueries({ queryKey: ['approvals', versionId] }),
      ]);
    } catch (err) {
      setError(err instanceof api.ApiClientError ? err.message : 'Could not update status.');
    } finally {
      setBusy(null);
    }
  };

  const myActions = nextActions.filter((a) => user && allowed(user.role, a));

  return (
    <div className="card">
      <h3 className="summary-title">
        Approval <StatusBadge status={status} />
      </h3>

      {myActions.length > 0 ? (
        <>
          <textarea
            className="approval-comment"
            placeholder="Optional comment…"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="approval-actions">
            {myActions.map((a) => (
              <button
                key={a}
                className={`btn btn-sm ${a === 'approve' ? 'btn-primary' : a === 'reject' ? 'btn-danger' : ''}`}
                disabled={busy !== null}
                onClick={() => act(a)}
              >
                {busy === a ? '…' : ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">
          {nextActions.length === 0
            ? 'No further action — this version is final in the workflow.'
            : 'No action available for your role here.'}
        </p>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      {events && events.length > 0 && (
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{e.action}</strong> by {e.actorName ?? 'someone'} ·{' '}
                <span className="muted">{formatDateTime(e.createdAt)}</span>
                <div className="muted">
                  {e.fromStatus} → {e.toStatus}
                  {e.comment ? ` · “${e.comment}”` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
