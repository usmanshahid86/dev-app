import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Project } from '@domain/types';
import { STAGE_LABELS } from '@domain/workflow';

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const load = () =>
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const p = await api.createProject({});
      nav(`/projects/${p.id}/discover`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const seed = async () => {
    setBusy(true);
    try {
      const r = await api.seedDemo();
      nav(`/projects/${r.projectId}/discover`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p: Project) => {
    if (!window.confirm(`Delete "${p.title}" and all its research? This cannot be undone.`)) return;
    await api.deleteProject(p.id);
    load();
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="lead">
            Each project is one exploration: from “what might be worth building?” to a build package a coding
            agent can execute.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={seed} disabled={busy}>
            Load demo project
          </button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            New exploration
          </button>
        </div>
      </div>
      {error && <div className="notice notice-error">{error}</div>}
      {projects === null ? (
        <div className="empty">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <h3>No projects yet</h3>
          <p>
            Start a new exploration — you don’t need an idea. Or load the deterministic demo project to see
            the whole workflow.
          </p>
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Project</th>
              <th>Stage</th>
              <th>Mode</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <a
                    href={`/projects/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      nav(`/projects/${p.id}`);
                    }}
                  >
                    <strong>{p.title}</strong>
                  </a>
                  {p.discoveryProfile.directionSeed && (
                    <div className="small muted">Direction: {p.discoveryProfile.directionSeed}</div>
                  )}
                </td>
                <td>{STAGE_LABELS[p.stage]}</td>
                <td>
                  <span className={`badge ${p.mode === 'demo' ? 'badge-demo' : 'badge-ok'}`}>{p.mode}</span>
                </td>
                <td className="small muted">{new Date(p.updatedAt).toLocaleString()}</td>
                <td>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
