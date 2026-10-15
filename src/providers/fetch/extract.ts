/**
 * Readable content extraction: Mozilla Readability over a linkedom DOM (no script execution),
 * with a plain-text fallback. Whitespace is normalized and the retained text is bounded.
 */
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { createHash } from 'node:crypto';

export interface ExtractedContent {
  title: string | null;
  text: string;
  truncated: boolean;
  hash: string;
  method: 'readability' | 'body_text' | 'plain';
}

export function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashText(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32);
}

function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

export function extractFromHtml(html: string, url: string, maxChars: number): ExtractedContent {
  let title: string | null = null;
  let body = '';
  let method: ExtractedContent['method'] = 'body_text';
  try {
    const { document } = parseHTML(html);
    for (const el of document.querySelectorAll('script, style, noscript, template, iframe, svg, canvas'))
      el.remove();
    title = document.querySelector('title')?.textContent?.trim() || null;
    try {
      const article = new Readability(document as any, { charThreshold: 200 }).parse();
      if (article?.textContent && article.textContent.trim().length >= 200) {
        body = article.textContent;
        if (article.title) title = article.title.trim() || title;
        method = 'readability';
      }
    } catch {
      /* fall through to body text */
    }
    if (!body) {
      for (const el of document.querySelectorAll('nav, header, footer, aside, form')) el.remove();
      body = document.body?.textContent ?? document.documentElement?.textContent ?? '';
    }
  } catch {
    body = html.replace(/<[^>]+>/g, ' ');
    method = 'plain';
  }
  const normalized = normalizeWhitespace(body);
  const { text, truncated } = clip(normalized, maxChars);
  void url;
  return { title, text, truncated, hash: hashText(normalized), method };
}

export function extractFromPlainText(raw: string, maxChars: number): ExtractedContent {
  const normalized = normalizeWhitespace(raw);
  const { text, truncated } = clip(normalized, maxChars);
  return { title: null, text, truncated, hash: hashText(normalized), method: 'plain' };
}
