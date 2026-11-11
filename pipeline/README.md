# pipeline/

Discovery-and-verification pipeline that keeps `data/` current. See
`docs/PIPELINE.md` (architecture, publication rules, sources, cost,
workflow) and `docs/REVIEW_GUIDE.md` (handling held items).

Entry points: `npm run ingest`, `npm run ingest:dry`, `npm run review`,
`npm run check-links`. Tests: `pipeline/__tests__/` (offline, fakes only).

Contracts: `shared/index.ts`, documented in `docs/DATA_MODEL.md`. Every write
is validated with `validateRegister(...)` first and serialised with
`serializeDataFile`.
