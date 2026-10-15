import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Snapshot } from './api';

interface ProjectCtx {
  projectId: string;
  snapshot: Snapshot | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** Run an action then refresh; surfaces errors as strings. */
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  actionError: string | null;
  clearActionError: () => void;
}

const Ctx = createContext<ProjectCtx | null>(null);
const POLL_MS = 1200;

export function ProjectProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getProject(projectId);
      setSnapshot(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any run is active.
  useEffect(() => {
    const active = snapshot?.runs.some((r) => r.status === 'running' || r.status === 'queued');
    if (active) timer.current = window.setTimeout(refresh, POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [snapshot, refresh]);

  const act = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      setActionError(null);
      try {
        const r = await fn();
        await refresh();
        return r;
      } catch (e) {
        setActionError((e as Error).message);
        await refresh();
        return undefined;
      }
    },
    [refresh],
  );

  return (
    <Ctx.Provider
      value={{
        projectId,
        snapshot,
        error,
        refresh,
        act,
        actionError,
        clearActionError: () => setActionError(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useProjectCtx(): ProjectCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProjectCtx outside ProjectProvider');
  return c;
}

/** Snapshot that is guaranteed loaded (pages are only rendered after load). */
export function useSnapshot(): Snapshot {
  const { snapshot } = useProjectCtx();
  if (!snapshot) throw new Error('snapshot not loaded');
  return snapshot;
}
