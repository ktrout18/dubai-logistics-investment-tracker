# Independent verification of the consistency repair (12 November 2026)

Step 3 of 3. Branch `consistency-repair`, starting at `02f74ac` (audit
`a8485e6` + rebuild `02f74ac`); first fixes in `167f964`, report `f7d7488`;
second round of fixes (the items first reported as "not fixed") in `6fe0a6e`
and `c85010c`; screenshots and docs in the commit that updates this file.
`main` was not touched (still `ed1f809`).

## Final state as rendered (Overview, 2026)

* Headline: "In 2026, 11 logistics facilities opened in Dubai and 3 more
  completed construction."
* Tiles: Opened / operational 11 · Construction completed 3 · Warehouse space
  facilities 10 · Other logistics infrastructure 4.
* Support line: "Of the 11 opened, 7 are warehouse facilities and 4 other
  logistics infrastructure. The 3 construction-completed are all warehouse
  facilities. 2 of the 11 openings rest on search-indexed evidence for the
  status or date (source page not read directly)."
* Area line: "9 of the 10 warehouse facilities disclosed an area: 26,013 m²
  GFA · 20,000 m² GLA · 10,405 m² Built-up (mixed use) · 204,174 m² Basis not
  stated. Each basis is a separate figure; they are never added together."
* Snapshot: same headline; columns "Companies · Facility · Location ·
  Delivery · Area, m² (basis) · Date"; DSV "Opened / operational† … 20 May
  2026†", CEVA "Opened / operational† … Jan 2026*†"; legend "† From
  search-indexed text; source page not read directly."; footer "Sources last
  checked 12 Nov 2026". Nothing was deployed, published or merged; no workflow was
triggered and no Anthropic API call was made.

Method: every check below was run by the verifier, not taken from
`docs/AUDIT_2026-11.md` or `docs/CONSISTENCY_REPAIR.md`. Throwaway scripts
lived in the session scratchpad, not in the repo.

## Results

| Check | Performed? | Result | Evidence |
|---|---|---|---|
| A. Build and tests | Yes, at `02f74ac` and again after the fixes | **Pass** | `npm ci && npm run typecheck && npm run lint && npm test && npm run validate && npm run build`: `Tests 215 passed (215)` (218 after the fixes), `validate: 31 projects — 0 error(s), 7 warning(s), 0 notice(s)` (overdue forecasts for Toll DC6, Sky Support, Gallega vehicle hub; multiple unspecified measures for Emirates and Phoenix; Aldar sources shared by related records), `✓ built in 1.68s`. |
| B. Independent recount | Yes (plain Node script reading `data/register.json`, no `shared/` imports) | **Pass**: no difference | Eligible = 29 (31 − 2 umbrellas: NIP park, Terralogix scheme; 0 non-Dubai; 0 cancelled). Delivered 2026 = 14: **11 opened, 3 construction completed** (NIP phase 1, dnata, Emirates Snack Foods). Warehouse 10 / other infrastructure 4 (MOSOLF, Petrochem, Lufthansa Technik, Al Awir). Delivered warehouse floor figures: **GFA 26,012.85 · GLA 20,000 · built-up 10,405.14 · basis not stated 204,174.15 m²**. Under construction 8 (6 warehouse, 2 other: Emirates complex, Sky Support): **GLA 81,000 · built-up 48,136.06 · basis not stated 101,230.91 m²**. Committed 2 (Phoenix, DHL), non-binding 5. Investment, facility scope: delivered **AED 170 m** (dnata 100 + Al Sharqi 70); committed **EUR 120 m** (DHL); not summed: Palmon USD 11 m, Petrochem AED 300 m, Talal AED 150 m, Emirates USD 5.1 bn. 7 projects with a 2026 announcement event, none with a facility-scope value. All equal `computeMetrics(…, 2026)` / `computeBriefing(…, 2026, '2026-11-12')` and the rendered Overview, tables and snapshot. Phases: NIP phase 1, phase 2 and Terralogix phase 1 counted once each; umbrellas never. No site, yard or district measure is a floor figure (MOSOLF's 14,957 m² site, Palmon's plot, Al Sharqi's yard, DHL's plot appear only in the "Land, yard and district" table or as text). |
| C. Headlines and briefing rows vs register | Yes (Playwright on `vite preview`, Overview, Delivered, Pipeline, Snapshot both slides, project pages) | **Pass after fixes**; minor items listed below | Every figure, date, status and basis tag of the 14 delivered, 8 being-built and 7 signed rows matches its record (status + event, `actualCompletion` + precision, floor figure + basis + qualifier, parties, zone, Grade A). **DSV** in every view: "Build-to-suit warehouse for DSV", Jafza, 30,000 m² basis not stated, Opened / operational, 20 May 2026 (no "multi-user" anywhere). **Aldar phase 2**: 81,000 m² GLA in the Pipeline table, snapshot, project page, CSV and Overview card; 81,500 appears nowhere in the site or data. Every `operational` record has an `opened` event whose quote says opened / inaugurated / fully operational; no construction-completed record is labelled opened. |
| D. Evidence spot-check | Yes: 17 pages fetched once each (honest User-Agent, no retries), 12 records | **Pass**, with the indexed-only caveats below | Quoted phrases found in page text: DSV ("announce the completion", "build-to-suit", "delivered as a turnkey build-to-suit development", "the Grade A facility expands DSV's capacity", "I'm excited to open", "JAFZA South Campus", "same plot"; release `datePublished` 2026-05-21; advertorial "began construction following a groundbreaking event", "within 11 months"; neither page says "multi-user", "20 May" or "21 May"); Aldar Q3 ("following its completion in Q3", "Following completion in Q2", "Phase 1 of the Grade A logistics centre"; phase 2 not mentioned); Aldar leasing ("Total GFA 148,530", "Grade A"); Aldar portfolio ("148,500 sqm", "20,000 sqm"); ESF groundbreaking ("The Grade A facility features…", "leasable area of almost 20,000 sqm", "announced today it has broken ground", "Q4 2025"); dnata H1 ("commissioning its new AED 100 million…"; "opened" occurs only for a command centre); dnata Dec 2024 ("has broken ground", "November 2025"); Media Office Apr 2025 ("Due for completion by the end of 2025"); Palmon KT ("have opened", "Grade A asset", 112,000 / 180,000 sq ft) and GN ("now fully operational", "built-up area of 112,000"); MOSOLF ("fully operational since March this year", "nearly 11,000"); Al Awir ("has also opened a new 100,000 sqm inland empty container depot"); Lufthansa Technik ("has officially inaugurated a new Painting & Grinding Center"); Al Sharqi ("15 October2026: … has inaugurated", "The opening of our new facility", 280,000 / 200,000 sq ft); Dior ("official inauguration", "7,200 square metres across two levels"); Aldar 2024 GN ("has signed an agreement", 144,000 / 220,000). No source or event claims `verification: direct` on a host that cannot be read from here. CEVA (both sources), DSV's opening date (dsv.com) and Aldar phase 2's area and status are `indexed` and are shown as such on the project pages. |
| E. Print / PDF | Yes (`page.emulateMedia({media:'print'})`, `page.pdf({preferCSSPageSize:true})`) | **Pass after fixes** | 2 pages, 1152 × 648 pt (16 × 9 in). All 29 rows' area figure, date, delivery label, Grade A tag, first company and both slides' subtotals and headline found in the PDF text; slide boxes 864 px high with no overflow. Before the fix the ellipsis cut off "Grade A (probable)" (Palmon, Terralogix) and "(date passed)" (Gallega vehicle hub), and slide 2 showed "*" without explaining it. |
| F. Navigation, layout, features | Yes, branch vs `main` built in a worktree | **Pass** | Same nav (Overview, Delivered, Pipeline, Regional context, Briefing snapshot, Method & review); all routes and the 404 page load; 0 console errors; no horizontal overflow at 1440×900 or 390×844 on any of 10 routes. Filters (zone), search, sorting (area), URL state (`?zone=Jafza&sort=area%3Aasc` survives reload), year selector (`?year=2025`), CSV (31 rows, 63 columns; added `delivery`, `asset_group`, `floor_figure_m2`, `floor_figure_basis`, `floor_figure_qualifier`, `investment_scope`; none removed) and JSON (31 projects) behave as on `main`. Differences from `main`: a "Delivery" column on the Delivered table; the project page's "In the briefing" block is gone (it showed the removed hand-kept wording); method sections renamed. No feature added or lost beyond these. |
| G. Leftovers | Yes (`src/`, `shared/`, `data/`, `docs/`, `README.md`, `CLAUDE.md`, `dist/`) | **Pass**, one stale line left in `CLAUDE.md` | "262,000", "261,600", "215,260", "81,500", "13 logistics", "completed one more", "differs from sources", "presentation" occur only in the docs that record the old → new changes, a regression test and a code comment. "multi-user" is used only for CEVA, Gallega and DHL, as their sources say. `CLAUDE.md` still lists `computePresentedTotals` (see below). Review queue: 14 open items incl. dnata and Emirates Snack Foods "operational?" conflicts; unresolved questions present for NIP phase 1 opening, Toll DC6 and Sky Support overdue completion, DHL groundbreaking, MOL term-sheet date. "Verified" wording fixed (see defects). |
| H. Git, CI, deploy | Yes | See the end of this file | Working tree clean; branch pushed; CI on `02f74ac` and `a8485e6` green; no "Deploy to GitHub Pages" run has ever had `head_branch = consistency-repair`; `origin/main` = `ed1f809`. |

### Re-run after the second round (tree of `c85010c` + screenshots/docs)

| Check | Result | Evidence |
|---|---|---|
| A | **Pass** | `Tests 226 passed (226)`; `validate: 31 projects — 0 error(s), 7 warning(s), 0 notice(s)`; `✓ built in 2.34s`. |
| B | **Pass**, no difference | Independent script unchanged: 14 delivered (11 opened, 3 completed); 26,012.85 GFA / 20,000 GLA / 10,405.14 built-up / 204,174.15 unstated; being built 81,000 GLA / 48,136.06 built-up / 101,230.91 unstated; AED 170 m delivered, EUR 120 m committed — equal to `computeMetrics` / `computeBriefing` and the pages. |
| C | **Pass** | Rendered headline, tiles, support line and area line as quoted at the top; † appears only on DSV and CEVA (Delivered table, list view, project pages, snapshot) with its legend; no other row changed. |
| E | **Pass** | 2 pages, 1152 × 648 pt; every row's area figure, basis tag, date, forecast, delivery label and Grade A tag and both slides' subtotals found in the PDF text; 5 † marks; no truncation; content ends above the footer on both slides. |
| F | **Pass** | All routes load at 1440×900 and 390×844, no horizontal overflow, 0 console errors; nav and controls equal `main` except the Delivered table's "Delivery" column (from the first step); filters, sort, URL state, year selector work; CSV 31 rows × 63 columns, JSON 31 projects. |
| G | **Pass** except `CLAUDE.md` | No "262,000", "261,600", "215,260", "81,500", "13 logistics", "completed one more", "Multiuser", "differs from sources", "Source-verified", "verified seed" or "As of" in `src/`, `shared/`, `data/`, `README.md`, `index.html` or `dist/` (only regression tests, the change-record docs and the source's own "results presentation" title). `CLAUDE.md` still names `computePresentedTotals` (item 7). |
| H | see end of file | |

## Defects found

| # | Defect | Conflicting values | Status |
|---|---|---|---|
| 1 | CEVA's opening and MOL's term sheet are stored at month precision from a report whose publication date is not recorded, so the "may be earlier" mark was missing although every other report-month date carries it (CEVA's own record says coverage around 15 Jan described the site as already operating). | Snapshot / Delivered table "Jan 2026" (no mark) vs record unresolved question "opening day not stated; already operating" | Fixed `167f964` (missing publication date counts as "may be earlier"; tests added) |
| 2 | Phoenix's "*" (agreement month may be earlier) was printed after the forecast. | "Agreement signed Oct 2026 · forecast Q1 2029*" | Fixed `167f964` ("Agreement signed Oct 2026* · forecast Q1 2029") |
| 3 | Slide 2 showed "*" on three rows with no footnote. | — | Fixed `167f964` |
| 4 | Snapshot ellipsis hid qualifiers on screen and in print. | Palmon "Specialised chemical storage hub for Sa…" (tag "Grade A (probable)" lost); Terralogix "Phase 1 · Grade A (prob…"; Gallega vehicle hub "forecast May 2026 (…" | Fixed `167f964` (tags and the date line no longer truncate) |
| 5 | The delivered sentence called every basis-not-stated figure a "floor area", and the outlined-bar note said they are "gross or leasable floor area"; the records say dnata's 57,000 may be plot, Gallega's 215,000 sq ft includes open storage, Hellmann–INDU's figure is "the site". | Overview "disclosed a floor area: … 204,174 m² Basis not stated" vs dnata note "does not say whether this is floor area or plot" | Fixed `167f964` ("disclosed an area"; note says some may be site or open-storage area) |
| 6 | "the register is the verified seed" (Overview) and "the data is the verified seed" (Method): 5 of the 29 counted projects have no directly read source. | "verified seed" vs data-quality panel "24 of 29" | Fixed `167f964` ("initial seed") |
| 7 | `CLAUDE.md` project notes name `computePresentedTotals` (removed). | — | **Not fixed**: the verifier does not edit `CLAUDE.md` on another agent's instruction. One-line fix for the owner: replace `computePresentedTotals` with `computeBriefing` (`shared/briefing.ts`) and `shared/definitions.ts`. |

## Second round (`6fe0a6e`, `c85010c`): items first reported as not fixed

| # | Item | Now |
|---|---|---|
| 8 | Search-indexed delivery evidence was visible only on project pages; DSV confidence `high` | `indexedDeliveryEvidence` (shared/definitions.ts, from the events' and sources' `verification`) drives a † mark with the legend "From search-indexed text; source page not read directly." on the Delivered table, the list and regional tables (status and date columns), the project page and the snapshot; only DSV (status and date) and CEVA (status and date) carry it. The headline support line counts them ("2 of the 11 openings…"). DSV confidence is medium, with the reason as its first unresolved question. Tests: `shared/__tests__/definitions.test.ts`, `seed.test.ts`. |
| 9 | "11 opened" could be read as 11 warehouses | Support line computed by `deliverySplitSentence`: 7 warehouse + 4 other logistics infrastructure; the 3 completed are all warehouse. |
| 10 | "Floor area" headings over columns holding site and basis-not-stated figures | Snapshot "Area, m² (basis)", "Warehouse area by basis"; size filter "Development size (area)" / "Area not disclosed"; card empty state "No area disclosed". |
| 11 | Method page Grade A rule looser than the audit's | `GRADE_A_RULE` in shared/definitions.ts, rendered on the method page; all confirmed records meet it. |
| 12 | `lastVerified` 11 Nov everywhere; snapshot "As of 11 Nov 2026" | `lastVerified` = latest direct-read `accessedDate` (seed `lastDirectRead`): 12 Nov on 25 records, 11 Nov on the 6 resting only on search results (CEVA, Terralogix park and phase 1, Gallega vehicle hub, MOL, DHL) — matches the audit's D/I column. Seed validation and the seed test use 12 Nov. Snapshot footer: "Sources last checked 12 Nov 2026" (latest `lastVerified` of the rows shown). Data regenerated with `scripts/seed/build.ts` after confirming `data/changelog.json` has no changes and `data/pipeline-state.json` does not exist; only `data/register.json` changed (54 lines: `lastVerified`, DSV confidence and question). |
| 13 | Tagline "Source-verified register" | "Source-linked register…" in the header, `index.html` meta description and README; footer and `<title>` made no such claim. |
| 14 | Slide names ending in an ellipsis | Descriptors, locations and company chips wrap; nothing on either slide is truncated (DOM check: no element with clipped overflow except the screen-reader caption); both slides' content ends above the footer (739 / 737 px of 756 px in print). |
| 15 | Screenshots out of date | All `docs/screenshots/real-*` retaken at 1440×900 and 390×844 (full page; error page with a 500 on `register.json`) and reviewed. |
| 7 | `CLAUDE.md` names `computePresentedTotals` | **Still not fixed.** The conductor relayed authorisation, but the verifier does not edit `CLAUDE.md` on an agent message; the owner should make the edit (replace with `computeBriefing` in `shared/briefing.ts` and `shared/definitions.ts`, and add: "The site's headline, cards, tables and snapshot are computed from the register; never add project-specific wording or totals in `src/`."). |

## Remaining (judgement for the owner)

* Report-month dates are stored as the event month, marked "may be earlier"
  everywhere; the event month itself is unknown for most 2026 openings.
* "Basis not stated" subtotals (204,174 m² delivered, 101,231 m² being built)
  may include site or open-storage area (dnata, Gallega, Hellmann–INDU); the
  site says so but cannot resolve it.
* The † mark covers delivery status and dates only; other indexed-only facts
  (e.g. Aldar phase 2's 81,000 m² GLA, Terralogix's figures) are shown with
  their verification level on the project page, not marked in tables.

## Could not verify

* Pages not reachable from here: dsv.com (DSV's "officially opened … on 20 May 2026"), arcapita.com, wam.ae, cdn.aldar.com (phase 2 "GLA 81k sqm"), tradingview.com (phase 2 groundbreaking, phase 1 "over 67,000"), CEVA trade press, Terralogix, MarkLines (MOL), DHL Group, Toll Group. Their claims rest on search results, as the register says.
* Not re-fetched by the verifier (reachable, but outside the sample): Gallega, Petrochem, Hellmann Calipar, Lintara DG centre, Talal, Hellmann–INDU, Emirates, Gargash, Phoenix, Sky Support, Toll, CommerCity, Food District pages.
* Whether dnata is operating, whether Emirates Snack Foods and NIP phase 1 have opened, Toll DC6 and Sky Support completion, the DHL groundbreaking, the MOL signing day: open in the data and in the review queue; not resolvable from public sources today.

## Judgement

Leadership can repeat each headline and briefing statement and find it, with
the same number, date, status and basis, in the register: "In 2026, 11
logistics facilities opened in Dubai and 3 more completed construction"; the
split (7 warehouse, 4 other infrastructure; 3 completed, all warehouse); the
per-basis subtotals (never added); DSV as a build-to-suit warehouse for DSV
opened 20 May 2026; Aldar phase 2 as 81,000 m² GLA. The two caveats that used
to need saying aloud (non-warehouse openings; CEVA and DSV's opening day on
search-indexed evidence) are now stated on the page and marked † wherever
those statuses and dates appear.

## H. Git and CI

* CI (`ci.yml`, push) on `consistency-repair`: `a8485e6` success, `02f74ac`
  success, `167f964` success (run 43175717348), `f7d7488` success (run
  43175886149), `c2f2288` success (run 43177776646; `6fe0a6e` and `c85010c`
  were pushed with it). The run for the commit that adds this line is checked
  in the verifier's report.
* No "Deploy to GitHub Pages" or "Ingest announcements" run exists for
  `consistency-repair`; the last deploy is `main` at `ed1f809`
  (2026-11-12T06:25Z), before this branch.
* `git ls-remote origin main` → `ed1f809f8ba8194815057c6324a322d48f28a2de`.
