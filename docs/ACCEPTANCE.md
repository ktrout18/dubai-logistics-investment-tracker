# Acceptance criteria

The owner's ten acceptance criteria, with the status of each and the exact
evidence. Checked on 11 November 2026; criteria 8–10 updated on 12 November
2026 after two paid dry runs and the first live (non-dry) run; review outcome
and the noise-reduction changes recorded on 13 November 2026.

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
| 9 | Unverified claims are held for review | met (live run 43181920655: 14 claims held in `pending-review.json`, a GitHub issue for each, register unchanged; all 14 then rejected in review) |
| 10 | The scheduled workflow actually runs and the deployed site reflects validated changes | partly met: a manually started live run (43181920655) validated, committed (`902cca6`) and redeployed the site from that commit; it changed run metadata and the review queue, not the register (nothing was published); no **scheduled** run yet (schedule off by the owner's decision) |

---

## 1. All PDF projects appear correctly — met

Meaning since the consistency repair (12 Nov 2026, `docs/CONSISTENCY_REPAIR.md`):
every project of the owner's PDF appears in the register with **evidence-based
values** (status, dates, areas and wording follow the audited sources,
`docs/AUDIT_2026-11.md`). The PDF's own totals and labels (e.g. "13 opened and
one completed", "about 262,000 m²", 261,600 m², 215,260 m²) are **deliberately
not reproduced**: they mixed area bases and counted completions as openings.

* `shared/__tests__/seed.test.ts`: "contains every project of the briefing PDF
  (26 rows), with evidence-based values and no PDF labels" (all 26 ids of
  `PDF_ROW_IDS` present with `provenance: seed_pdf`; no record carries a
  `presentation` block); "the 2026 headline is derived and true" (11 opened /
  operational, 3 construction completed, 10 warehouse facilities and 4 other
  logistics infrastructure); "per-basis subtotals, never a cross-basis total";
  "the same record shows the same thing everywhere" (DSV, NIP phase 2,
  qualified figures, dates); "investment aggregates use facility-scope amounts
  only".
* `npm run validate` → `validate: 31 projects — 0 error(s), 7 warning(s), 0 notice(s)`.
* Browser (real data, `vite preview`, 12 Nov 2026): the Overview headline reads
  "In 2026, 11 logistics facilities opened in Dubai and 3 more completed
  construction."; `#/snapshot` and its print/PDF output show the same sentence
  and per-basis subtotals (26,013 m² GFA · 20,000 m² GLA · 10,405 m² built-up
  (mixed use) · 204,174 m² basis not stated; being built 81,000 m² GLA ·
  48,136 m² built-up · 101,231 m² basis not stated); the Delivered table
  renders 14 rows with a Delivery column.
* Screenshots: `docs/screenshots/real-overview-desktop.png`,
  `real-snapshot-desktop.png`, `real-delivered-desktop.png`,
  `real-pipeline-desktop.png`, `real-detail-dsv-desktop.png`,
  `real-detail-nip-phase-2-desktop.png`, `real-method-desktop.png` (and
  `-mobile` variants).

## 2. dnata's commissioning included — met

* `shared/__tests__/seed.test.ts`: "seed register: dnata › is one project with
  the Dec 2024 announcement and the Nov 2026 commissioning confirmation" and
  "is construction completed (not opened), dated 2026 at year precision".
* Browser (real data), `#/project/dnata-logistics-dubai-south-warehouse`:
  shows the Dec 2024 announcement and groundbreaking (dnata media centre), and the Emirates Group H1 2026-27 results "published
  5 Nov 2026" quoting "commissioning its new AED 100 million … logistics
  facility in Dubai South", with links to dnata.com and the Dubai Media Office.
* Counted under "Construction completed", never as opened (headline, cards, snapshot).

## 3. Grade-A capacity distinguished — met

* `shared/__tests__/metrics.test.ts`: "pipeline-stage figures › under
  construction splits Grade-A (confirmed+probable) vs other", "year switching ›
  probable is never merged into confirmed".
* Rule: Grade A is "confirmed" only with a quoted developer or official use of
  the words (`docs/DATA_MODEL.md` §5 rule 5, `docs/SEED_NOTES.md` §2). In the
  register, 3 delivered warehouse projects are Grade-A confirmed (NIP phase 1,
  DSV, Emirates Snack Foods) and 1 probable (Palmon / Manrre); the site shows
  Grade-A and other figures separately. Since the consistency repair, the
  warehouse cards include only warehouse-type assets; depots, terminals, MRO
  and vehicle hubs are counted separately as other logistics infrastructure
  (`shared/definitions.ts`).

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

## 9. Unverified claims are held — met

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
* **Live run** (43181920655, not a dry run): `0 change(s) published; 14 held
  for review`. The 14 items were written to `data/pending-review.json` in the
  bot commit `902cca6`, each with its evidence, quote and reasons, and a
  GitHub issue labelled `pending-review` was opened for each (#1–#14). The
  register and changelog are byte-identical. Every hold was right not to
  publish (§10 lists them).

## 10. The scheduled workflow runs and the site reflects validated changes — partly met

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

* **Second paid dry run, after the fixes.** Same inputs, on commit `a81a714`:
  https://github.com/ktrout18/dubai-logistics-investment-tracker/actions/runs/43165141664
  → **success**.
  * `Run run-20261112T060136Z (dry run): PARTIAL.` / `31 source(s) scanned
    (6 via a fallback method); 152 new document(s); 16 extracted; 18
    candidate fact(s).` / `0 change(s) published; 5 held for review;
    searches used 40/40; estimated cost $1.1103.`
  * The first run's fixes held: the dnata results page was not published
    (`already recorded (milestone already recorded as event
    2026-01-01-commissioned)`); every search-only source and all 5 rechecks
    got a search; the summary line shows the true totals.
  * **Measured cost split:** web searches 38 billed, $0.38;
    `claude-haiku-5-5` 38 calls, 606,864 input / 35,338 output tokens,
    $0.0784; `claude-opus-5-5` 16 calls, 94,773 input / 13,643 output
    tokens, $0.6520.
  * Not scanned: PCFC (`web search error: max_uses_exceeded`) and Reuters
    (`HTTP 400 … domains are not accessible to our user agent:
    ['reuters.com']`).
  * Held: DP World's Jafza Grade A groundbreaking (already in the register
    as `dp-world-lintara-jafza-dg-logistics-centre`; identity tied), Floward
    Al Ain twice (Abu Dhabi), Emirates' engineering/MRO groundbreaking
    (already in the register, but matched to the wrong project), DP World's
    Al Rugaylat terminal (not Dubai).
  * Defects found and fixed in `41adc4a` and `abbbae6` (tests in
    `pipeline/__tests__/live-trial.test.ts`): seven claims from one Khaleej
    Times round-up dropped as "already pending review"; a cited URL
    identifying every facility on that page; `max_uses_exceeded` discarding
    search results; milestones other than openings dated by the
    publication date; rechecks keeping back searches for rechecks already
    run. Reuters disabled in `data/sources.json`.

* **First live (non-dry) run.** Manual dispatch on 12 Nov 2026 with
  `dry_run: false`, `search_provider: anthropic`, `extract: true` (other
  inputs at their defaults) on commit `2572951`:
  https://github.com/ktrout18/dubai-logistics-investment-tracker/actions/runs/43181920655
  → **success** (ingest, `deploy / build`, `deploy / deploy` all green;
  08:18–08:40 UTC).
  * CLI: `mode: LIVE (writes data/); search: anthropic; extraction: claude-opus-5-5; Anthropic API calls possible: yes`.
  * `Run run-20261112T081952Z: SUCCESS.` / `32 source(s) scanned (8 via a
    fallback method); 168 new document(s); 15 extracted; 17 candidate
    fact(s).` / `0 change(s) published; 14 held for review; searches used
    40/40; estimated cost $1.1027.` Every enabled source was scanned (PCFC
    via site search again; Reuters disabled).
  * **Measured cost split:** web searches 40 billed, $0.40;
    `claude-haiku-5-5` 40 calls, 612,099 input / 41,606 output tokens,
    $0.0820; `claude-opus-5-5` 15 calls, 89,342 input / 13,165 output
    tokens, $0.6207.
  * `Files written: pendingReview, meta, state`; `npm run validate` passed
    on the runner; the commit step made `902cca6 data: automated ingest
    2026-11-12T08:38Z` (`data/meta.json`, `data/pending-review.json`, new
    `data/pipeline-state.json`); `data/register.json` and
    `data/changelog.json` unchanged.
  * The deploy job built from that commit (the build log shows
    `902cca668b…` checked out, `validate: 31 projects — 0 error(s)`,
    `sync-data: copied 5 file(s)`) and reported success. The site shows the
    last successful run (`meta.lastSuccessfulRun` = 12 Nov 2026 08:19 UTC)
    and the open review count (28, was 14), both computed from the
    committed data. The derived headline and totals did not change
    (`computeBriefing`: "In 2026, 11 logistics facilities opened in Dubai
    and 3 more completed construction."), because nothing was published.
  * 20 issues opened (#1–#20): the 14 new holds first, then 6 of the 14
    seed review items (cap of 20 per run; the other 8 get theirs on the
    next run). No issue repeats a seed item or another issue's review item;
    #10 and #11 are the same Floward Al Ain story from two papers (two
    evidence URLs), and three holds (#3 DP World Jafza, #4 Terralogix, #12
    Emirates engineering) are projects the register already has.
  * Defects found and fixed after the run (`1d763a9`):
    "37,000-square-metre" was not recognised as a square-metre unit;
    issues for seed items were titled "new announcement" (the four affected
    issues were retitled). Before the run (`2572951`): the seed build now
    refuses to overwrite data once the pipeline has written records, and
    new holds get issues before older items.
* **Review of the live run's holds (13 Nov 2026).** All 14 items were
  rejected with `npm run review -- reject <id> --note "…"` (commit
  `b5ba29c`; register and changelog byte-identical; 14 seed items still
  open, so the site's open-review count is back to 14) and issues #1–#14
  were closed (`not planned`) with the same one-line reasons: outside the
  UAE (2), other emirate (5, one a duplicate of #10), already in the
  register (3: `dp-world-lintara-jafza-dg-logistics-centre`,
  `terralogix-logistics-park-warsan`, `emirates-engineering-complex-dubai-south`),
  not a facility (1), too vague (1), east-coast terminals outside Dubai (2).
* **Noise reduction (commit `2fb67c4`, offline only).** A triage step sets
  aside claims outside the UAE, non-facilities and restatements before
  review, records other-emirate claims as regional mentions, and merges the
  same story from two pages into one held item; search-only sources are off
  by default and the search cap is 20 (`docs/PIPELINE.md` §3.1, §3.7a).
  None of this has run against the API yet.

What is **not** shown yet:

* **No scheduled run has happened**: the schedule (`30 4 * * *`,
  `30 12 * * *` UTC) is wired but off by the owner's decision (repository
  variable `SCHEDULE_ENABLED` not set).
* **The 13 Nov 2026 changes have not run live**: triage, regional mentions,
  same-story merging and the reduced search set are proven with fakes only,
  and the ≈ $0.86 per-run cost is an estimate.
* **No pipeline-made change to the register** has been published,
  committed and deployed: the live run published nothing, so the path
  "publish → ChangeRecord → validated commit → site totals change" is proven
  only offline (criterion 5). Criteria 5–7 remain "met offline only".
* The deployed site could not be opened from the build container (its
  network blocks github.io); the browser checks in §1–2 were made on the same
  build served locally.
