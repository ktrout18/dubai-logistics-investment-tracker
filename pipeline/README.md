# pipeline/

Ingestion pipeline (owned by the pipeline worker). Runs twice daily from GitHub
Actions via `tsx`, scans the sources configured in `data/sources.json`, and
writes changes to `data/register.json`, `data/changelog.json`,
`data/pending-review.json` and `data/meta.json`.

Contracts to code against: `shared/index.ts`, documented in
`docs/DATA_MODEL.md`. Before writing any data file, run
`validateRegister(...)` and refuse to commit when `result.ok` is false; write
files with `serializeDataFile` so diffs stay stable.
