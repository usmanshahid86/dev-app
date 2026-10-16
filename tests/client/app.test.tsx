// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@client/App';
import { makeCtx } from '../helpers';
import { seedDemoProject } from '@workflows/seed';
import { createApp } from '@server/app';

/**
 * UI smoke test: the real Hono app serves fetch() in-process, backed by an in-memory DB seeded with
 * the deterministic demo project. Verifies the major screens render and navigation works.
 */
describe('UI smoke', () => {
  let projectId: string;
  beforeEach(async () => {
    const ctx = makeCtx();
    const seeded = await seedDemoProject(ctx);
    projectId = seeded.projectId;
    const app = createApp(ctx);
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return app.request(url.startsWith('http') ? url : `http://localhost${url}`, init);
    });
  });

  it('renders the projects list with the demo banner', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/DEMO MODE/)).toBeInTheDocument();
    expect(await screen.findByText(/Exploring broadly/)).toBeInTheDocument();
  });

  it('shows opportunity cards with evidence strength and opens the evidence inspector', async () => {
    render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/discover`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
    const cards = await screen.findAllByText(/Evidence (strong|medium|weak)/);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByText(/Portable project memory/));
    const chips = await screen.findAllByTitle('Inspect evidence');
    fireEvent.click(chips[0]!);
    expect(await screen.findByRole('dialog', { name: 'Inspector' })).toBeInTheDocument();
    expect(await screen.findByText(/Discovered by/)).toBeInTheDocument();
    expect(screen.getAllByText('DEMO').length).toBeGreaterThan(0);
  });

  it('navigates research → decision → build and shows requirement traceability', async () => {
    render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/research`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Product Brief v1/)).toBeInTheDocument();
    expect(await screen.findByText(/1\. Executive summary/)).toBeInTheDocument();
    // retrieval strips above the comparison table and the brief (seeded runs execute every search)
    const strips = await screen.findAllByTestId('retrieval-strip');
    expect(strips.length).toBeGreaterThanOrEqual(2);
    expect(strips[0]!.textContent).toMatch(/Fresh retrieval complete/);
    fireEvent.click(screen.getByRole('link', { name: /^Decision/ }));
    await waitFor(() => expect(screen.getByText(/Agent recommends/)).toBeInTheDocument());
    expect(screen.getByText('BUILD', { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /^Build/ }));
    expect(await screen.findByText('Functional requirements')).toBeInTheDocument();
    expect(screen.getAllByText(/asm_[a-z0-9]+/).length).toBeGreaterThan(0);
    expect(screen.getByText(/AGENT-HANDOFF\.md/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /^Validate/ }));
    expect(await screen.findByText('Re-check opportunity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /^Research log/ }));
    expect(await screen.findByRole('heading', { name: 'Research log' })).toBeInTheDocument();
  });

  it('shows the discovery setup form for a fresh project with Explore broadly', async () => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const { project } = (await res.json()) as any;
    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/discover`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('What might be worth building?')).toBeInTheDocument();
    expect(screen.getByText(/Explore broadly/)).toBeInTheDocument();
    expect(screen.getByText('I already have a direction')).toBeInTheDocument();
  });
});
