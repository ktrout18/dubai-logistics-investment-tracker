# Acceptance criteria

The owner's ten acceptance criteria, with the status of each and the exact
evidence. Checked on 11 November 2026.

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
| 8 | A blocked source triggers fallback research | met offline only (fetch-side fallbacks also seen live) |
| 9 | Unverified claims are held for review | met offline only |
| 10 | The scheduled workflow actually runs and the deployed site reflects validated changes | see §10 (partly demonstrated) |

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

## 8. Blocked source triggers fallback — met offline only

* `pipeline/__tests__/acceptance.test.ts` "d. primary source returning 403":
  html_list (403) → alt_url (403) → site_search; the blocked article is
  requested once (no retries), the search snippet and a syndicated Dubai Media
  Office copy are used instead, and `meta.sourceScans` records
  `fallback_used` via `site_search`.
* Live (fetch side only, no search): DP World falls back from its
  JavaScript-rendered listing to its sitemap, and PCFC is reported `failed`
  with every reason when no search provider is configured
  (`docs/PIPELINE.md` §5, and §10 below for the GitHub runner).

## 9. Unverified claims are held — met offline only

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

## 10. The scheduled workflow runs and the site reflects validated changes

To be completed after the workflow runs on GitHub (see below).
