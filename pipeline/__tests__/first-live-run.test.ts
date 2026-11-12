/**
 * Pre-flight for the first non-dry run: the issue step must reach this run's
 * new holds even when older open items (the hand-written seed review items)
 * have no issue yet.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeDataFile } from '../../shared/index.ts';
import { FakeExtractor, FakeIssues, acmeProject, article, betaProject, fact, makeDataDir, quietWeb, run } from './helpers.ts';

const URL = 'https://gulfnews.com/business/delta-freight-warehouse-1.500977';

describe('issues on the first live run', () => {
  it("opens this run's held items first, then older items, at most 20", async () => {
    const root = await makeDataDir([acmeProject(), betaProject()]);
    const older = Array.from({ length: 25 }, (_, i) => ({
      id: `rev-20261111-${String(i).padStart(8, '0')}`,
      createdAt: '2026-11-11T12:00:00Z',
      kind: 'new_project',
      proposed: {},
      evidence: [{ url: `https://news.example.com/older-${i}` }],
      reasonHeld: 'Seed item written by hand.',
      state: 'open',
    }));
    await writeFile(join(root, 'data', 'pending-review.json'), serializeDataFile({ schemaVersion: 1, items: older }));
    const web = quietWeb();
    web.set('https://gulfnews.com/news_sitemap.xml', {
      status: 200,
      contentType: 'text/xml',
      body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>${URL}</loc><news:news><news:publication_date>2026-11-10T09:00:00+04:00</news:publication_date><news:title>Delta Freight logistics warehouse</news:title></news:news></url></urlset>`,
    });
    web.set(URL, { status: 200, body: article({ title: 'Delta Freight logistics warehouse', date: '2026-11-10', paragraphs: ['Delta Freight said on 9 November 2026 it signed an agreement to build a warehouse in Dubai Industrial City, Dubai.'] }) });
    const claim = fact({
      projectName: 'Delta Freight warehouse', developer: 'Delta Freight', partiesQuote: 'Delta Freight said', zone: 'Dubai Industrial City', location: 'Dubai Industrial City',
      locationQuote: 'in Dubai Industrial City', emirate: 'Dubai', emirateQuote: 'Dubai Industrial City, Dubai', assetType: 'warehouse', sectors: ['modern_warehousing'],
      eventType: 'agreement_signed', eventQuote: 'signed an agreement to build a warehouse', eventDate: { date: '2026-11-09', precision: 'day', quote: 'on 9 November 2026' },
    });
    const issues = new FakeIssues();
    const report = await run(root, { web, extractor: new FakeExtractor({ [URL]: [claim] }), issues });

    expect(report.held).toHaveLength(1); // single secondary source
    expect(issues.created).toHaveLength(20);
    expect(issues.created[0]!.key).toBe(report.held[0]!.reviewId);
  });
});
