import { describe, it, expect } from 'vitest';
import { canonicalizeUrl } from '@domain/canonicalUrl';

const c = (u: string) => canonicalizeUrl(u)?.canonicalUrl;

describe('URL canonicalization', () => {
  it('lowercases the host and strips www.', () => {
    expect(c('https://WWW.Example.COM/Path')).toBe('https://example.com/Path');
    expect(canonicalizeUrl('https://www.example.com/')?.domain).toBe('example.com');
  });
  it('removes fragments and userinfo', () => {
    expect(c('https://example.com/a#section')).toBe('https://example.com/a');
    expect(c('https://user:pw@example.com/a')).toBe('https://example.com/a');
  });
  it('removes tracking parameters but keeps meaningful ones', () => {
    expect(c('https://example.com/docs?utm_source=x&utm_medium=y&ref=tw&fbclid=1&gclid=2&page=3')).toBe(
      'https://example.com/docs?page=3',
    );
    expect(c('https://example.com/docs?v=2&id=abc')).toBe('https://example.com/docs?id=abc&v=2');
    expect(c('https://example.com/docs?id=abc')).not.toBe(c('https://example.com/docs?id=def'));
  });
  it('drops default ports and keeps non-default ports', () => {
    expect(c('https://example.com:443/a')).toBe('https://example.com/a');
    expect(c('http://example.com:80/a')).toBe('http://example.com/a');
    expect(c('https://example.com:8443/a')).toBe('https://example.com:8443/a');
  });
  it('normalizes the trailing slash consistently', () => {
    expect(c('https://example.com/a/')).toBe('https://example.com/a');
    expect(c('https://example.com/a')).toBe('https://example.com/a');
    expect(c('https://example.com')).toBe('https://example.com/');
    expect(c('https://example.com/')).toBe('https://example.com/');
  });
  it('does not over-canonicalize scheme or path case', () => {
    expect(c('http://example.com/a')).not.toBe(c('https://example.com/a'));
    expect(c('https://example.com/A')).not.toBe(c('https://example.com/a'));
  });
  it('rejects non-http schemes and garbage', () => {
    expect(canonicalizeUrl('file:///etc/passwd')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});
