# Independent verification of the consistency repair (12 November 2026)

Step 3 of 3. Branch `consistency-repair`, starting at `02f74ac` (audit
`a8485e6` + rebuild `02f74ac`); fixes in `167f964`. `main` was not touched
(still `ed1f809`). Nothing was deployed, published or merged; no workflow was
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

## Not fixed (reported; larger than a targeted fix or a judgement for the owner)

* **Indexed-only evidence is visible only on project pages.** CEVA (opened; both sources indexed, confidence medium) and DSV's 20 May date (dsv.com, indexed) appear in the headline count, tables and snapshot as plain "Opened / operational" with no marker; the verification level and an unresolved question show on the project page. DSV's confidence is `high` although its opening date is indexed-only (its own net-new note says "medium confidence"). DSV's operational status is also supported directly ("I'm excited to open", completion release 21 May).
* **"11 logistics facilities opened"** includes 4 non-warehouse assets (Petrochem terminal and HQ, Lufthansa Technik painting and grinding centre, MOSOLF vehicle hub, Al Awir container depot). The tiles beside it say 10 warehouse / 4 other infrastructure; the sentence itself does not.
* **"Floor area" headings** remain on the snapshot column and the "Warehouse floor area by basis" subtotal although the basis-not-stated subtotals (204,174 / 101,231 m²) include figures that may be site or open storage (dnata, Gallega, Hellmann–INDU). MOSOLF's 14,957 m² site and Gargash's 232,258 m² plot appear, tagged "Site / land", in the snapshot's "Floor area, m² (basis)" column (text only, no bar, not subtotalled).
* **Dates.** All records keep `lastVerified: 2026-11-11` and the snapshot says "As of 11 Nov 2026", though the sources were re-read on 12 Nov (the audit explains the seed test pins the date). Report-month dates are still stored as the event month, marked "may be earlier" everywhere; the event month itself is not known for most 2026 openings.
* **Method page wording**: "Grade-A confirmed only when a source states the grade or its specification (for example clear height…)" is looser than the audit's rule (an explicit Grade A statement by the developer, owner or an official body). All confirmed records meet the stricter rule.
* **Header tagline** "Source-verified register" (unchanged from `main`; design) while 5 counted projects rest on search results only.
* Long descriptors and locations still end in an ellipsis on the slides (full text in the tooltip and on the tracker); screenshots in `docs/screenshots/` predate `167f964`.

## Could not verify

* Pages not reachable from here: dsv.com (DSV's "officially opened … on 20 May 2026"), arcapita.com, wam.ae, cdn.aldar.com (phase 2 "GLA 81k sqm"), tradingview.com (phase 2 groundbreaking, phase 1 "over 67,000"), CEVA trade press, Terralogix, MarkLines (MOL), DHL Group, Toll Group. Their claims rest on search results, as the register says.
* Not re-fetched by the verifier (reachable, but outside the sample): Gallega, Petrochem, Hellmann Calipar, Lintara DG centre, Talal, Hellmann–INDU, Emirates, Gargash, Phoenix, Sky Support, Toll, CommerCity, Food District pages.
* Whether dnata is operating, whether Emirates Snack Foods and NIP phase 1 have opened, Toll DC6 and Sky Support completion, the DHL groundbreaking, the MOL signing day: open in the data and in the review queue; not resolvable from public sources today.

## Judgement

Leadership can repeat each headline and briefing statement and find it, with
the same number, date, status and basis, in the register: "In 2026, 11
logistics facilities opened in Dubai and 3 more completed construction"; the
per-basis subtotals (never added); DSV as a build-to-suit warehouse for DSV
opened 20 May 2026; Aldar phase 2 as 81,000 m² GLA. Two caveats to say aloud:
the 11 include 4 non-warehouse facilities, and two of the 11 (CEVA, and the
DSV opening day) rest on search results rather than pages read directly.

## H. Git and CI

* CI (`ci.yml`, push) on `consistency-repair`: `a8485e6` success, `02f74ac`
  success, `167f964` success (run 43175717348). The run for the commit that
  adds this file is checked in the verifier's report.
* No "Deploy to GitHub Pages" or "Ingest announcements" run exists for
  `consistency-repair`; the last deploy is `main` at `ed1f809`
  (2026-11-12T06:25Z), before this branch.
* `git ls-remote origin main` → `ed1f809f8ba8194815057c6324a322d48f28a2de`.
