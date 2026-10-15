import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useProjectCtx } from '../lib/useProject';
import type { WorkflowEvent } from '@domain/types';

export function LogPage() {
  const { projectId } = useProjectCtx();
  const [events, setEvents] = useState<WorkflowEvent[] | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    api.events(projectId).then(setEvents);
  }, [projectId]);
  const shown = (events ?? []).filter((e) => !filter || e.type.includes(filter));
  const types = [...new Set((events ?? []).map((e) => e.type))].sort();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Research log</h1>
          <p className="lead">
            Local, structured workflow events: what was queried, what came back, what was extracted, what you
            looked at and what you decided. No model reasoning is recorded.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <label>
          Type{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          {shown.length} events
        </span>
      </div>
      {events === null ? (
        <div className="empty">Loading…</div>
      ) : (
        shown.map((e) => (
          <div key={e.id} className="log-row">
            <span className="muted">{new Date(e.createdAt).toLocaleTimeString()}</span>
            <span className="mono">{e.type}</span>
            <pre>{JSON.stringify(e.payload)}</pre>
          </div>
        ))
      )}
    </div>
  );
}
