/**
 * FixturePageFetcher — serves the demo corpus' page texts for demo.invalid URLs; everything else is
 * 'unavailable' (never performs network I/O). Labelled isDemo.
 */
import { PageFetchError, type FetchedPage, type PageFetcher } from './PageFetcher';
import { findDemoPageByUrl } from '../../../fixtures/demo/corpus';
import { hashText } from './extract';

export class FixturePageFetcher implements PageFetcher {
  readonly name = 'fixture';
  readonly isDemo = true;
  async fetchPage(url: string): Promise<FetchedPage> {
    const page = findDemoPageByUrl(url);
    if (!page) throw new PageFetchError('fixture fetcher only serves demo.invalid pages', 'unavailable');
    if (!page.text)
      throw new PageFetchError('demo page has no body (simulated fetch failure)', 'http_error', 404);
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      contentType: 'text/html',
      title: `[DEMO] ${page.title}`,
      text: page.text,
      textTruncated: false,
      fetchedAt: new Date().toISOString(),
      contentHash: hashText(page.text),
      isDemo: true,
    };
  }
}
