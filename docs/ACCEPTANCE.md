# Acceptance criteria

The owner's ten acceptance criteria, with the status of each and the exact
evidence. Checked on 11 November 2026; criteria 8–10 updated on 12 November
2026 after the first paid dry run.

Status values: **met** (shown on real data or on GitHub), **met offline only**
(proven by automated tests with fakes, not yet on a live run), **not yet
demonstrated**.

Commands referred to below were run in the repository root:

```
npm ci && npm run typecheck && npm run lint && npm test && npm run validate && npm run build
```

Browser checks were made with Playwright (Chromium) against `vite preview` of
the production build (`dist/`), on the real register.

| # | Criterion | Status |
|---|---|---|
| 1 | All PDF projects appear correctly | met |
| 2 | dnata's commissioning included | met |
| 3 | Grade-A capacity distinguished from other logistics infrastructure | met |
| 4 | Land and yard never inflate warehouse floor-space metrics | met |
| 5 | A simulated new official opening updates the project, its status history and the totals | met offline only |
| 6 | A repeated article makes no duplicate | met offline only |
| 7 | MoU → signed agreement updates the existing project | met offline only |
| 8 | A blocked source triggers fallback research | met (live dry run: PCFC 403 → site search; WAM, Dubai Trade, DHL, DSV via site search) |
| 9 | Unverified claims are held for review | met offline; seen in a live dry run (5 held, nothing written because it was a dry run) |
| 10 | The scheduled workflow actually runs and the deployed site reflects validated changes | not yet demonstrated end to end: workflow and deploy proven on GitHub in zero-spend mode; paid search and extraction proven in one dry run ($1.12); no run has yet committed data and redeployed; schedule off by the owner's choice |

---

## 1. All PDF projects appear correctly — met

* `shared/__tests__/seed.test.ts`: "contains every PDF row 1–26 exactly once",
  "puts PDF rows in the right sections", "lists the three not-counted items
  and nothing added after the PDF yet", "openings: 261,600 m² across ten
  disclosed facilities", "openings: 13 opened and one completed only (Aldar
  NIP phase 1)", "being built: 215,260 m² from rows 15–19; Emirates (row 20)
  not counted".
* `npm run validate` → `validate: 31 projects — 0 error(s), 5 warning(s), 0 notice(s)`
  (the 5 warnings are expected; `docs/SEED_NOTES.md` §5).
* Browser (real data): Overview headline reads "Dubai opened 13 logistics
  facilities and completed one more in 2026, with about 262,000 m² of floor
  space."; `#/snapshot` shows 261,600 m² and 215,260 m²; the Delivered table
  renders 14 rows and the Pipeline table 10 rows, each with evidence links;
  CSV and JSON exports of the full register each contain 31 projects.
* Row-by-row mapping and every difference from the PDF: `docs/SEED_NOTES.md` §2.
* Screenshots: `docs/screenshots/real-overview-desktop.png`,
  `real-snapshot-desktop.png`, `real-delivered-desktop.png`,
  `real-pipeline-desktop.png` (and `-mobile` variants).

## 2. dnata's commissioning included — met

* `shared/__tests__/seed.test.ts`: "seed register: dnata (PDF row 2) › is one
  project with the Dec 2024 announcement and the Nov 2026 commissioning
  confirmation" and "keeps the strict status at construction_completed and the
  PDF label "Apr to Sep"".
* Browser (real data), `#/project/dnata-logistics-dubai-south-warehouse`:
  shows "5 Dec 2024 · Announcement" and "5 Dec 2024 · Construction started"
  (dnata media centre), and the Emirates Group H1 2026-27 results "published
  5 Nov 2026" quoting "commissioning its new AED 100 million … logistics
  facility in Dubai South", with links to dnata.com and the Dubai Media Office.
* Screenshot: `docs/screenshots/real-detail-desktop.png`.

## 3. Grade-A capacity distinguished — met

* `shared/__tests__/metrics.test.ts`: "pipeline-stage figures › under
  construction splits Grade-A (confirmed+probable) vs other", "year switching ›
  probable is never merged into confirmed".
* Rule: Grade A is "confirmed" only with a quoted developer or official use of
  the words (`docs/DATA_MODEL.md` §5 rule 5, `docs/SEED_NOTES.md` §2). In the
  seed, 3 delivered projects are Grade-A confirmed (rows 1, 3, 8); the site
  shows Grade-A and other figures separately.

## 4. Land and yard never inflate warehouse floor space — met

* `shared/__tests__/metrics.test.ts`: "land and yard never inflate warehouse
  metrics" (4 tests), "area bases are never mixed" (5 tests).
* `shared/__tests__/seed.test.ts`: "land, yard, district, site and unspecified
  areas contribute 0 to warehouse floor metrics".
* Pipeline: `pipeline/__tests__/acceptance.test.ts` "g. area bases and
  forecast dates" (3 tests): a "100,000 sq m plot" extracted as warehouse GFA
  is stored as `site_land_area` and adds 0 to warehouse totals; a forecast date
  never becomes `actualCompletion`.

## 5. Simulated official opening — met offline only

* `pipeline/__tests__/acceptance.test.ts` "a. official opening of an existing
  under-construction project": a Jafza press release (fake web) is fetched,
  extracted (fake model), grounded and published. The same project becomes
  `operational`, gains one `opened` event and `actualCompletion`, ChangeRecords
  are written for `events`, `sources`, `actualCompletion`, `status` (under
  construction → operational, `verified_official`), `latestMilestone` and
  `lastVerified`, all citing the article; `computeMetrics` delivered warehouse
  GFA rises from 0 to 20,000 m² and the project leaves "under construction";
  the written files pass `validateRegister`.
* Not yet seen on a live run (no paid extraction has been run).

## 6. A repeated article makes no duplicate — met offline only

* `pipeline/__tests__/acceptance.test.ts` "b. the same article again, and a
  syndicated copy" (3 tests): the same URL is not extracted twice and leaves
  register and changelog byte-identical; a syndicated Gulf News copy adds a
  source but no event, status change or project; an identical copy at another
  URL is not extracted; a new project announced officially and re-reported by
  the media in a later run stays one project.

## 7. MoU → signed agreement — met offline only

* `pipeline/__tests__/acceptance.test.ts` "c. MoU followed by a signed
  agreement": the existing project moves `mou` → `signed_agreement` with one
  appended event, a `status` ChangeRecord (mou → signed_agreement) and no new
  project record.

## 8. Blocked source triggers fallback — met

* `pipeline/__tests__/acceptance.test.ts` "d. primary source returning 403":
  html_list (403) → alt_url (403) → site_search; the blocked article is
  requested once (no retries), the search snippet and a syndicated Dubai Media
  Office copy are used instead, and `meta.sourceScans` records
  `fallback_used` via `site_search`.
* Live (fetch side only, no search): DP World falls back from its
  JavaScript-rendered listing to its sitemap, and PCFC is reported `failed`
  with every reason when no search provider is configured
  (`docs/PIPELINE.md` §5, and §10 below for the GitHub runner).
* Live with search (paid dry run, run 43158953250): `scan pcfc … fallback_used
  via site_search: 8 search results (anthropic, site:pcfc.ae, after
  2026-11-05); earlier: html_list failed: blocked (HTTP 403): HTTP 403 |
  alt_url failed: blocked (HTTP 403): HTTP 403 (6 new document(s))`. WAM,
  Dubai Trade, DHL and DSV (no article links in the listing HTML) also fell
  back to site search (8, 6, 7 and 8 documents).

## 9. Unverified claims are held — met offline; seen in a live dry run

* `pipeline/__tests__/acceptance.test.ts` "e. claims that must be held for
  review": a single secondary source, a quote not found in the page, a
  conflicting area and an ambiguous identity are all held in
  `pending-review.json` with their reasons; a GitHub issue is requested for
  each (fake tracker); the register is byte-identical and no ChangeRecord is
  written.
* "h. non-Dubai announcements": a claim with no emirate is held; a Sharjah
  project is regional context only.
* "f. all sources failing": data byte-identical, run `failed`,
  `lastSuccessfulRun` not advanced, no "no new announcements" claim.
* Live dry run (run 43158953250): 5 claims held, for the right reasons
  (single secondary source; identity ambiguous between four projects; two
  Abu Dhabi items whose emirate is not named in the quote; a location quote
  not found in the page). Being a dry run, nothing was written to
  `pending-review.json` and no issue was opened. The same run would have
  **published** one claim that should have been held (dnata "opened", see
  §10); `pipeline/__tests__/live-trial.test.ts` now covers that case.

## 10. The scheduled workflow runs and the site reflects validated changes — not yet demonstrated end to end

What **is** shown:

* **The workflow runs on GitHub.** Manual dispatch in zero-spend mode
  (`dry_run: true`, `search_provider: none`, `extract: false`, `since: 14d`,
  `redeploy: true`) on commit `1d7c331`:
  https://github.com/ktrout18/dubai-logistics-investment-tracker/actions/runs/43031415378
  → **success** (ingest job, `deploy / build`, `deploy / deploy` all green).
  * Plan line: `event=workflow_dispatch dry_run=true search=none extract=false anthropic_api_calls_possible=false redeploy=true`.
  * `ANTHROPIC_API_KEY secret present: true` (the key is configured; it was
    not passed to the pipeline and has not been used).
  * CLI: `mode: dry run; search: none; extraction: off; Anthropic API calls possible: no (zero spend)`.
  * Result: `Run run-20261111T134227Z (dry run): PARTIAL.` 14 of 33 sources
    scanned (DP World and Aldar via the sitemap fallback), 44 new documents,
    0 extracted, 17 relevant documents not analysed (extraction off),
    searches used 0/40, estimated cost $0.0000, files written: none.
  * The 19 sources reported "could NOT be scanned" are the search-only
    sources (no search provider in this mode) plus Dubai Trade, WAM, DHL and
    DSV (no article links in the listing HTML) and PCFC (HTTP 403 on both
    pages). On the GitHub runner, unlike the build container, the Emirates
    media centre listing worked (18 links).
  * `npm run validate` passed on the runner; the commit step was skipped (dry
    run) and `main` was not changed by the run.
  * The reusable deploy ran from the ingest workflow (`redeploy`) and
    published the site with `pages: write` / `id-token: write`.
* **CI and Deploy on push** for `1d7c331`: CI run 43031402561 success,
  Deploy run 43031402530 success.
* **The commit path is guarded:** commit only when not a dry run, after
  ingest and `npm run validate` both pass, and only if `data/` changed
  (`pipeline/__tests__/units.test.ts` "ingest.yml: schedule gated by
  SCHEDULE_ENABLED, zero-spend manual defaults, no secrets in the file").

* **Paid search and extraction run on GitHub (one dry run).** Manual
  dispatch on 12 Nov 2026 with `dry_run: true`, `search_provider:
  anthropic`, `extract: true` (other inputs at their defaults) on commit
  `a21541a`:
  https://github.com/ktrout18/dubai-logistics-investment-tracker/actions/runs/43158953250
  → **success**; the ingest step took 12 min 44 s.
  * Plan line: `event=workflow_dispatch dry_run=true search=anthropic extract=true anthropic_api_calls_possible=true redeploy=false`.
  * CLI: `mode: dry run; search: anthropic; extraction: claude-opus-5-5; Anthropic API calls possible: yes`.
  * The key authenticated; no API error, refusal, rate limit or failed
    search appears in the log, and all 16 extraction calls returned
    usable output.
  * Result: `Run run-20261112T050550Z (dry run): PARTIAL.` 22 of 33 sources
    scanned (7 via a fallback), 97 new documents, 16 extracted, 18 candidate
    facts, 1 would-be publication, 5 held. Searches used 40 of 40 (11
    search-only sources were then skipped: `search cap reached (40)`).
  * **Measured cost: $1.1238** (the run report's estimate at list prices:
    40 web searches = $0.40, model tokens about $0.72). The tokens by model
    are in the report artifact, which the build container's network policy
    could not download; later runs print them in the log.
  * `npm run validate` passed; the commit step was skipped (dry run) and
    `main` was not changed by the run.
  * Defects found and fixed in commit `dd92de8` (with tests in
    `pipeline/__tests__/live-trial.test.ts`): the summary line showed
    `searches used 0/40; estimated cost $0.0000`; blocked-article fallback
    searches used up the cap before the search-only sources; the one
    would-be publication (dnata `opened`, from the half-year results
    wording "commissioning its new … logistics facility", already recorded
    as the `commissioned` event, dated by the release's publication date)
    was wrong and is now held; the log did not show claims, evidence URLs
    or tokens.

What is **not** shown yet:

* **No scheduled run has happened**: the schedule (`30 4 * * *`,
  `30 12 * * *` UTC) is wired but off until the owner sets the repository
  variable `SCHEDULE_ENABLED` to `true`.
* **No live run has written data.** The paid path has run only as a dry
  run, so no automated data commit has yet gone through validation →
  commit → deploy, and the site has not yet shown a pipeline-made change.
  The fixes from the dry run (search reserve, the two new hold rules) have
  not yet been exercised against the live API. Next step, with the owner's
  go-ahead: a manual run with `dry_run` unticked (about $1.1, judging by the
  one measured run).
* The deployed site could not be opened from the build container (its
  network blocks github.io); the browser checks in §1–2 were made on the same
  build served locally.
