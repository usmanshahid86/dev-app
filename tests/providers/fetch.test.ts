import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { HttpPageFetcher } from '@providers/fetch/http';
import { PageFetchError } from '@providers/fetch/PageFetcher';
import { checkUrlSyntax, checkUrlForFetch, isPrivateIPv4, isPrivateIPv6 } from '@providers/fetch/safety';
import { extractFromHtml, normalizeWhitespace } from '@providers/fetch/extract';
import { FixturePageFetcher } from '@providers/fetch/fixture';

const HTML = `<!doctype html><html><head><title>Test Page Title</title><script>alert(1)</script><style>p{}</style></head>
<body><nav>Nav links</nav><article><h1>Heading</h1>${'<p>Readable paragraph text about billing that is long enough for readability to consider it article content.</p>'.repeat(6)}</article><footer>Footer</footer></body></html>`;

describe('URL safety (no network)', () => {
  it('accepts http and https public hosts', () => {
    expect(checkUrlSyntax('https://example.com/a').ok).toBe(true);
    expect(checkUrlSyntax('http://example.com/a').ok).toBe(true);
  });
  const bad = [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://[::1]/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://[fd00::1]/x',
    'http://[fe80::1]/x',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/x',
    'http://user:pw@example.com/x',
    'http://0.0.0.0/x',
    'http://100.64.0.1/x',
    'http://[::ffff:10.0.0.1]/x',
    'http://foo.internal/x',
  ];
  for (const u of bad) it(`rejects ${u}`, () => expect(checkUrlSyntax(u).ok).toBe(false));
  it('classifies IP ranges', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true);
    expect(isPrivateIPv6('2606:4700::1111')).toBe(false);
    expect(isPrivateIPv6('fc00::1')).toBe(true);
  });
  it('rejects hostnames that resolve to private addresses', async () => {
    const res = await checkUrlForFetch('http://evil.example/x', async () => ['93.184.216.34', '10.0.0.1']);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/non-public/);
    expect((await checkUrlForFetch('http://good.example/x', async () => ['93.184.216.34'])).ok).toBe(true);
  });
});

describe('HttpPageFetcher against a local server', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/page')
        return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(HTML);
      if (url === '/plain')
        return void res.writeHead(200, { 'content-type': 'text/plain' }).end('plain   text\n\n\n\nhere');
      if (url === '/redirect') return void res.writeHead(302, { location: '/page' }).end();
      if (url === '/redirect-private')
        return void res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }).end();
      if (url.startsWith('/loop')) return void res.writeHead(302, { location: '/loop' }).end();
      if (url === '/binary')
        return void res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.alloc(100));
      if (url === '/pdf')
        return void res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4');
      if (url === '/big') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.write('<html><body>');
        for (let i = 0; i < 200; i++) res.write('x'.repeat(10_000));
        return void res.end('</body></html>');
      }
      if (url === '/slow')
        return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end(HTML), 2000);
      if (url === '/500') return void res.writeHead(500).end('nope');
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const fetcher = () =>
    new HttpPageFetcher({
      allowLoopbackForTests: true,
      limits: { timeoutMs: 800, maxRedirects: 3, maxBodyBytes: 500_000, maxTextChars: 400 },
    });

  it('fetches and extracts readable HTML with title, normalized whitespace, truncation and stable hash', async () => {
    const page = await fetcher().fetchPage(`${base}/page`);
    expect(page.status).toBe(200);
    expect(page.title).toBe('Test Page Title');
    expect(page.text).toMatch(/Readable paragraph text about billing/);
    expect(page.text).not.toMatch(/alert\(1\)|Nav links|Footer/);
    expect(page.text.length).toBeLessThanOrEqual(400);
    expect(page.textTruncated).toBe(true);
    const again = await fetcher().fetchPage(`${base}/page`);
    expect(again.contentHash).toBe(page.contentHash);
  });
  it('handles plain text', async () => {
    const page = await fetcher().fetchPage(`${base}/plain`);
    expect(page.text).toBe('plain text\n\nhere');
    expect(page.contentType).toBe('text/plain');
  });
  it('follows a public redirect and records the final URL', async () => {
    const page = await fetcher().fetchPage(`${base}/redirect`);
    expect(page.finalUrl).toBe(`${base}/page`);
  });
  it('rejects a redirect to a private target', async () => {
    await expect(fetcher().fetchPage(`${base}/redirect-private`)).rejects.toMatchObject({
      code: 'blocked_redirect',
    });
  });
  it('caps redirect depth', async () => {
    await expect(fetcher().fetchPage(`${base}/loop`)).rejects.toMatchObject({ code: 'too_many_redirects' });
  });
  it('rejects binary and non-text content', async () => {
    await expect(fetcher().fetchPage(`${base}/binary`)).rejects.toMatchObject({
      code: 'unsupported_content',
    });
    await expect(fetcher().fetchPage(`${base}/pdf`)).rejects.toMatchObject({ code: 'unsupported_content' });
  });
  it('enforces the body size limit while streaming', async () => {
    await expect(fetcher().fetchPage(`${base}/big`)).rejects.toMatchObject({ code: 'too_large' });
  });
  it('times out', async () => {
    await expect(fetcher().fetchPage(`${base}/slow`)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('reports HTTP errors', async () => {
    await expect(fetcher().fetchPage(`${base}/500`)).rejects.toMatchObject({
      code: 'http_error',
      status: 500,
    });
  });
  it('blocks loopback by default (production settings)', async () => {
    const prod = new HttpPageFetcher({ limits: { timeoutMs: 500 } });
    await expect(prod.fetchPage(`${base}/page`)).rejects.toBeInstanceOf(PageFetchError);
    await expect(prod.fetchPage(`${base}/page`)).rejects.toMatchObject({ code: 'blocked_url' });
  });
});

describe('extraction helpers', () => {
  it('normalizes whitespace', () => {
    expect(normalizeWhitespace('a  \t b\r\n\r\n\r\n\r\nc')).toBe('a b\n\nc');
  });
  it('falls back to body text for short documents', () => {
    const r = extractFromHtml(
      '<html><head><title>T</title></head><body><p>short</p></body></html>',
      'https://x',
      1000,
    );
    expect(r.title).toBe('T');
    expect(r.text).toBe('short');
    expect(r.method).toBe('body_text');
  });
});

describe('FixturePageFetcher', () => {
  it('serves demo pages and fails for pages without text', async () => {
    const f = new FixturePageFetcher();
    const page = await f.fetchPage('https://demo.invalid/forum/coding-agents-lose-context');
    expect(page.isDemo).toBe(true);
    expect(page.text).toMatch(/CONTEXT\.md/);
    await expect(f.fetchPage('https://demo.invalid/listicle/top-50-saas-ideas')).rejects.toMatchObject({
      code: 'http_error',
    });
    await expect(f.fetchPage('https://example.com/')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
