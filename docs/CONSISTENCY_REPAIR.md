# Consistency repair (12 November 2026)

Step 2 of 3. Goal: any headline or briefing statement leadership repeats can
be found, with the same wording and number, in the detailed evidence register.
Design, navigation and features are unchanged; no projects were added.

## What changed

* **One source of truth.** The hand-kept `presentation` block (PDF descriptor,
  area label, charted figure, date label, milestone, colour category,
  "differs from sources" note) is gone from the schema, the seed, the fixtures
  and `data/register.json`, and `computePresentedTotals` is replaced by
  `computeBriefing(projects, year, today)` in `shared/briefing.ts`. The
  Overview headline, the figure cards, the tables, the project pages, the
  briefing snapshot (and its print/PDF), the method page and the CSV export
  are all built from the audited records with the rules in `shared/`.
  `provenance: 'seed_pdf'` and `seedNote` remain as provenance only.
* **Definitions in one place:** `shared/definitions.ts` (delivery labels and
  helper, warehouse vs other-infrastructure asset types, eligibility rules,
  investment scope and sums); `shared/format.ts` (the only number, area, money
  and date formatters).
* **Schema additions:** `AreaMeasure.qualifier` (`over | nearly | about`),
  `Investment.scope` (`facility | wider_than_facility | unknown`), asset type
  `bulk_liquid_terminal`. Removed: `PresentationSchema` and its enums.
* **Seed data changes** (all from the audit's findings; `data/changelog.json`
  was empty and `data/pipeline-state.json` absent, so `scripts/seed/build.ts`
  was re-run): qualifiers on NIP phase 1 (over 67,000), Emirates Snack Foods
  (nearly 20,000, "almost"), MOSOLF PDI (nearly 11,000 sq ft), Hellmann–INDU
  (nearly 300,000 sq ft), Terralogix scheme (about 182,000); investment scope
  on every disclosed amount; Petrochem's asset type `dangerous_goods_store` →
  `bulk_liquid_terminal` (its own record calls it a bulk chemical terminal);
  the derived "81,500" removed from NIP phase 2's note and unresolved
  question; seed notes and pending-review proposals no longer refer to
  briefing labels; three `meta.json` coverage notes reworded.

## Corrected claims and totals (old → new)

| Old briefing statement | Now (derived, as rendered) |
|---|---|
| "Dubai opened 13 logistics facilities and completed one more in 2026, with about 262,000 m² of floor space" | "In 2026, 11 logistics facilities opened in Dubai and 3 more completed construction." |
| 261,600 m² floor space opened (cross-basis sum) | Warehouse floor area by basis, never added: **26,013 m² GFA · 20,000 m² GLA · 10,405 m² built-up (mixed use) · 204,174 m² basis not stated** — 9 of the 10 warehouse facilities disclosed one |
| 215,260 m² being built | **81,000 m² GLA · 48,136 m² built-up (mixed use) · 101,231 m² basis not stated** (8 projects; Emirates complex and Sky Support are other infrastructure) |
| 14 "openings" all counted as opened | 11 Opened / operational; 3 Construction completed (NIP phase 1, dnata, Emirates Snack Foods) |
| DSV "Multiuser warehouse · 20 May" | "Build-to-suit warehouse for DSV" · 20 May 2026 · Opened / operational · 30,000 m² basis not stated |
| NIP phase 2 "81,500 m²" | 81,000 m² GLA everywhere |
| Palmon "10,400" | 10,405 m² built-up (mixed use); Grade A (probable) |
| NIP phase 1 "67,000" | over 67,000 m², basis not stated; Q3 2026; construction completed |
| Dates "15 Oct", "15 Jan", "14 Jan", "21 Sep", "31 Mar", "24 Mar", "August" | Oct 2026, Jan 2026, Jan 2026, Sep 2026, Mar 2026, Mar 2026, Aug 2026, each marked "may have happened earlier" where the month is the release month |
| Al Awir "100,000 m² site" charted as yard | 100,000 m² basis not stated, shown as text; other logistics infrastructure; never floor space |
| AED 300 m Petrochem, USD 5.1 bn Emirates, AED 150 m Talal, USD 11 m Palmon in investment views | Listed under "Not summed" with "More than the logistics facility"; facility-scope sums only (2026 delivered: AED 170 m = dnata + Al Sharqi) |
| "Briefing differs from sources" badges, "Strictly, sources confirm only completion for 3", "floor space as reported", "Not counted (unconfirmed)" list, † footnotes | Removed. Toll DC6 and Sky Support appear under "Being built" with "Forecast … (date passed)"; DHL under signed/committed |

## Definitions

* **Opened / operational** = status `operational`: a source explicitly
  reports the opening, inauguration or start of operations.
* **Construction completed** = status `construction_completed`: completion or
  commissioning reported, no opening reported. Always shown and counted
  separately.
* Where evidence establishes neither, the record keeps its lower status and is
  not counted as delivered; doubts stay as unresolved questions, confidence
  and review items.

## Eligibility for aggregates

1. Dubai only; umbrellas never counted (phases count); cancelled excluded.
2. Warehouse-space figures: asset types warehouse, distribution centre,
   fulfilment centre, cold store, dangerous-goods store, logistics park.
   Everything else (container terminal/depot, bulk liquid terminal, air cargo
   terminal, MRO/aerospace, vehicle processing, inland port/rail, open yard,
   mixed industrial, other) is **other logistics infrastructure**, counted
   separately. 2026: 10 warehouse facilities, 4 other infrastructure
   (Al Awir depot, Lufthansa Technik, MOSOLF, Petrochem).
3. Delivered in a year requires a sourced `actualCompletion` in that year.
4. One floor figure per facility (`floorFigure`): GFA, GLA or built-up, else a
   basis-not-stated primary figure; land, site, yard, district and secondary
   unstated figures never count. Subtotals per basis, never added. Depots and
   other infrastructure areas are never drawn as floor-space bars.
5. Investment: per currency, never converted; facility-scope amounts only;
   wider or unknown scope listed separately.
6. One formatter: whole m², thousands separators, the source's qualifier kept;
   dates at stored precision; forecasts always labelled.

## Remaining evidence gaps (unchanged by this step)

* The basis of every "basis not stated" figure (204,174 m² delivered,
  101,231 m² being built), including DSV's 30,000 and NIP phase 1's lower
  bound.
* dnata: whether it is operating (only "commissioning"); Emirates Snack Foods
  and NIP phase 1: no opening reported. Both conflicts stay open in the review
  queue.
* Event days for most 2026 openings (stored by month of the release).
* NIP phase 2's 81,000 m² GLA rests on a 2024 search snippet; Terralogix rests
  on search results only; Toll DC6 and Sky Support completions are overdue and
  unconfirmed; the DHL groundbreaking and Gallega vehicle-hub go-live are
  unconfirmed.
* `CLAUDE.md` (project notes) still names `computePresentedTotals`; it was not
  edited here.
