import { describe, it, expect } from 'vitest';
import { validateFinding } from '@domain/findings';
import { ev } from './lineage.test';

const fetched = ev('ev_a', {
  fetchStatus: 'fetched',
  fullText: 'The Team plan starts at $499 per month billed annually, includes 10 projects.',
  snippet: 'Pricing page for the sync platform.',
});
const snippetOnly = ev('ev_b', {
  snippet: 'Free tier limited to 1 project and 100 MAU; next tier is $499/month.',
});
const allowed = new Map([
  [fetched.id, fetched],
  [snippetOnly.id, snippetOnly],
]);

describe('finding validation', () => {
  it('a sourced fact needs valid evidence; invented ids are dropped and the fact is demoted', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        evidenceIds: ['ev_nope'],
      },
      allowed,
    );
    expect(v.kind).toBe('inference');
    expect(v.supportLevel).toBe('inference');
    expect(v.evidenceIds).toEqual([]);
    expect(v.notes.join(' ')).toMatch(/dropped unknown evidence id ev_nope/);
  });
  it('snippet-only support is represented as such', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        evidenceIds: ['ev_b'],
      },
      allowed,
    );
    expect(v.supportLevel).toBe('snippet_only');
  });
  it('a verified excerpt against a fetched page yields the strongest support level', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        evidenceIds: ['ev_a'],
        excerpts: [{ evidenceId: 'ev_a', excerpt: 'starts at $499 per month billed annually' }],
      },
      allowed,
    );
    expect(v.supportLevel).toBe('full_page_excerpt_verified');
    expect(v.excerpts[0]).toMatchObject({ verified: true, note: 'full_page' });
  });
  it('a fetched page without a verifiable excerpt is full_page support only', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        evidenceIds: ['ev_a'],
        excerpts: [{ evidenceId: 'ev_a', excerpt: 'the plan costs nine hundred dollars' }],
      },
      allowed,
    );
    expect(v.supportLevel).toBe('full_page');
    expect(v.excerpts[0]).toMatchObject({ verified: false });
    expect(v.excerpts[0]!.note).toMatch(/not_found/);
  });
  it('an excerpt cannot be validated against another evidence record', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        evidenceIds: ['ev_b'],
        excerpts: [{ evidenceId: 'ev_a', excerpt: 'starts at $499 per month billed annually' }],
      },
      allowed,
    );
    expect(v.excerpts).toEqual([]);
    expect(v.notes.join(' ')).toMatch(/not cited by the finding/);
  });
  it('an inference stays an inference even with evidence attached', () => {
    const v = validateFinding(
      {
        key: 'F1',
        section: 's',
        claim: 'c',
        kind: 'inference',
        supportStrength: 'weak',
        evidenceIds: ['ev_a'],
      },
      allowed,
    );
    expect(v.kind).toBe('inference');
    expect(v.supportLevel).toBe('inference');
    expect(v.evidenceIds).toEqual(['ev_a']);
  });
});
