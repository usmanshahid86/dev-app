/**
 * Supporting-excerpt validation. An agent-claimed quote is only "verified" if it appears in the
 * retained text of the SAME evidence record it cites, after conservative normalization.
 */
export const MAX_EXCERPT_CHARS = 600;
export const MIN_EXCERPT_CHARS = 12;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ExcerptCheck =
  | { verified: true; against: 'full_page' | 'snippet' }
  | { verified: false; reason: 'too_short' | 'too_long' | 'not_found' | 'no_text' };

/**
 * @param excerpt   agent-claimed quote
 * @param fullText  retained page text (null if never fetched)
 * @param snippet   search snippet + title (always available)
 */
export function checkExcerpt(excerpt: string, fullText: string | null, snippet: string): ExcerptCheck {
  const q = normalizeForMatch(excerpt);
  if (q.length < MIN_EXCERPT_CHARS) return { verified: false, reason: 'too_short' };
  if (excerpt.length > MAX_EXCERPT_CHARS) return { verified: false, reason: 'too_long' };
  if (fullText && normalizeForMatch(fullText).includes(q)) return { verified: true, against: 'full_page' };
  if (snippet && normalizeForMatch(snippet).includes(q)) return { verified: true, against: 'snippet' };
  if (!fullText && !snippet) return { verified: false, reason: 'no_text' };
  return { verified: false, reason: 'not_found' };
}
