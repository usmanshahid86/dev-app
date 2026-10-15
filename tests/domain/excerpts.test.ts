import { describe, it, expect } from 'vitest';
import { checkExcerpt, normalizeForMatch } from '@domain/excerpts';

const page =
  'We keep a CONTEXT.md with the architecture notes,\n  our naming conventions and the decisions we made — and paste it into every new session.';

describe('excerpt validation', () => {
  it('accepts an exact excerpt from the page', () => {
    expect(checkExcerpt('our naming conventions and the decisions we made', page, '')).toEqual({
      verified: true,
      against: 'full_page',
    });
  });
  it('accepts whitespace/punctuation-normalized excerpts', () => {
    expect(checkExcerpt('architecture   notes, our naming conventions', page, '')).toEqual({
      verified: true,
      against: 'full_page',
    });
    expect(checkExcerpt('“decisions we made” and paste it', page, '')).toEqual({
      verified: true,
      against: 'full_page',
    });
  });
  it('falls back to the snippet when no page text exists', () => {
    expect(
      checkExcerpt(
        'paste it into every new session',
        null,
        'Developers paste it into every new session of every agent.',
      ),
    ).toEqual({ verified: true, against: 'snippet' });
  });
  it('rejects invented excerpts', () => {
    expect(checkExcerpt('vendors confirmed 90% adoption in 2026', page, 'snippet text here')).toEqual({
      verified: false,
      reason: 'not_found',
    });
  });
  it('rejects too-short and too-long excerpts', () => {
    expect(checkExcerpt('notes', page, '')).toEqual({ verified: false, reason: 'too_short' });
    expect(checkExcerpt('x '.repeat(400), page, '')).toEqual({ verified: false, reason: 'too_long' });
  });
  it('normalizes consistently', () => {
    expect(normalizeForMatch('  Hello,   WORLD!! ')).toBe('hello world');
  });
});
