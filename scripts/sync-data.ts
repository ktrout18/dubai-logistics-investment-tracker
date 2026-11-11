/**
 * `npm run sync-data` — copy data/*.json into public/data/ so Vite serves
 * them at ./data/*.json in dev and copies them into dist/data/ on build.
 * public/data/ is git-ignored: data/ is the only canonical copy.
 *
 * data/pipeline-state.json (the pipeline's processed-URL list and run history)
 * is internal bookkeeping that the site never reads, so it is not published.
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from './data-files.ts';

const src = resolve(REPO_ROOT, 'data');
const dest = resolve(REPO_ROOT, 'public', 'data');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
/** Data files that stay out of the public site. */
const NOT_PUBLISHED = new Set(['pipeline-state.json']);
const files = (await readdir(src)).filter((f) => f.endsWith('.json') && !NOT_PUBLISHED.has(f));
await Promise.all(files.map((f) => copyFile(resolve(src, f), resolve(dest, f))));
console.log(`sync-data: copied ${files.length} file(s) to public/data/`);
