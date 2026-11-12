# Seed notes: 2026 register (seeded 11 November 2026, audited 12 November 2026)

> **Evidence audit, 12 Nov 2026.** Every record was re-checked field by field
> against its sources (`docs/AUDIT_2026-11.md`). The reviewed evidence is the
> single source of truth; the PDF never overrides it. Structured fields below
> reflect the audit.
>
> **Consistency repair, 12 Nov 2026.** The `presentation` (briefing) blocks
> and `computePresentedTotals` were removed. The headline and the briefing
> snapshot are now derived from the audited records by `computeBriefing`
> (`docs/CONSISTENCY_REPAIR.md`). The PDF columns in §2 are kept only as a
> record of what the old briefing said; none of it is shown on the site.

This page explains how `data/register.json` and `data/pending-review.json`
were seeded from the owner's November 2026 briefing PDF, how each PDF figure
maps to the structured (strict) data, and what could not be verified.

* **Source of truth for the seed:** `scripts/seed/` (`sources.ts` holds every
  source with its verification level, `projects.ts` the projects,
  `pending.ts` the review items). `npx tsx scripts/seed/build.ts` rebuilds
  both data files; `--check` validates without writing. **Do not re-run it
  once the pipeline has added records**: it overwrites both files.
* **Evidence:** `research/pdf-sources.{json,md}`, `research/seed-research.{json,md}`,
  plus pages read directly while seeding (listed in §6).
* **Counts:** 31 projects (26 PDF rows, 2 umbrellas, 3 further projects
  found while seeding), 14 pending-review items, 0 regional (non-Dubai) projects.
  `npm run validate`: 0 errors, 7 warnings (§5).

## 1. One view of the data

Since the consistency repair there is a single view. `computeMetrics` and
`computeBriefing` (shared/) apply the rules in `shared/definitions.ts` to the
audited records; every page, the snapshot and the CSV use them. The PDF's own
totals ("13 opened and one completed", 261,600 m² opened, 215,260 m² being
built) are deliberately not reproduced: they mixed area bases and counted
three completions as openings. Derived 2026 figures: 11 opened / operational,
3 construction completed (rows 1, 2 and 7); warehouse floor area by basis
26,013 m² GFA · 20,000 m² GLA · 10,405 m² built-up (mixed use) · 204,174 m²
basis not stated. Which PDF claims the evidence does not support: AUDIT §5.

## 2. All 26 PDF rows

Verification: **direct** means the page text was read, either by the
research worker or while seeding. **indexed** means the page was seen only in
search results. "Milestone" is the verification level of the source behind
the latest event. Grade A: **confirmed** only where a developer or official
source uses the words "Grade A" (quoted in `gradeAEvidence`).

| Ref | Project id | PDF figure | Structured figure / basis | Grade A | Verification | Differences from the PDF |
|---|---|---|---|---|---|---|
| 1 | `aldar-logistics-centres-nip-phase-1` | 67,000; Q3, completed | 67,000 m² `unspecified`; construction completed Q3 2026 | confirmed (Aldar Q3 2026) | Milestone direct; area indexed (2 of 4 sources direct) | The basis of 67,000 is stated in no page read; the figure comes only from search snippets of the Nov 2025 release. A phase of the NIP umbrella. |
| 2 | `dnata-logistics-dubai-south-warehouse` | 57,000; Apr to Sep | 57,000 m² `unspecified`; AED 100 m; "commissioning" in Apr–Sep 2026 (year precision) → construction completed (weakest call) | unverified | Direct (all sources re-read 12 Nov) | The PDF says opened; all three copies of the release say "commissioning". `netNew` unknown. |
| 3 | `dsv-lintara-jafza-build-to-suit-warehouse` | 30,000; 20 May | 30,000 m² `unspecified`; opened 20 May 2026 (DSV press, indexed); completion announced 21 May (direct) | confirmed (DSV/Arcapita release) | Direct (2 of 4); opening date indexed | Single-occupier build-to-suit for DSV, not "multiuser". 20 May is supported (DSV); 21 May is the release date. |
| 4 | `al-sharqi-shipping-dic-logistics-hub` | 26,000; 15 Oct | 26,012.85 m² `warehouse_gfa` (280,000 sq ft built-up storage) + 18,580.61 m² `open_yard`; AED 70 m; opened Oct 2026 (month) | unverified | Direct (1 of 1) | 15 Oct is the release dateline; ceremony day not stated. Offices and basement not in the figure. |
| 5 | `ceva-logistics-dubai-south-ecommerce-warehouse` | 23,000; 15 Jan | 23,000 m² `unspecified`; opened Jan 2026 (month) | unverified | **Indexed only** (0 of 2) | Trade press only; building probably predates 2026. |
| 6 | `gallega-global-logistics-jafza-3pl-hub` | 20,000; 20 May | 19,974.15 m² `unspecified` (215,000 sq ft); inaugurated May 2026 (month) | unverified | Direct (3 of 3) | "Open storage and multi-user facility"; enclosed floor area not confirmed. Merged with the Feb 2026 "Aftermarket Hub". |
| 7 | `emirates-snack-foods-cold-store-dubai-south` | 20,000; Q2 | 20,000 m² `gla` ("leasable area of almost 20,000 sqm"); construction completed Q2 2026 | **confirmed** (Aldar: "The Grade A facility features state-of-the-art cold store capabilities") | Direct (3 of 3) | GLA basis; the PDF says opened, Aldar gives only completion. |
| 8 | `palmon-manrre-jafza-chemical-storage-hub` | 10,400; 14 Jan | 10,405.14 m² `mixed_building_area` + 16,722.55 m² `site_land_area`; USD 11 m (incl. land); opened Jan 2026 (month) | **probable** (newspapers relaying the owner only) | Direct (2 of 2) | Owner Manrre REIT; operator Safe Logistics; ceremony day not stated. |
| 9 | `dior-regional-distribution-centre-ezdubai` | 7,200; 21 Sep | 7,200 m² `unspecified` (two levels); inaugurated Sep 2026 (month) | unverified | Direct (1 of 1) | 21 Sep is the newsroom date. |
| 10 | `mosolf-automotive-hub-jafza` | 1,000; March | 1,021.93 m² `unspecified` (PDI warehouse, basis not stated) + 14,957.39 m² `site_land_area`; operational since Mar 2026 | not applicable | Direct (1 of 1) | The PDI warehouse is not stated as GFA. |
| 11 | `petrochem-jebel-ali-terminal-and-hq` | Not disclosed (AED 300 m); 14 Jan | No area; AED 300 m (terminal + HQ + office buildings); inaugurated Jan 2026 (month) | not applicable | Direct (1 of 1) | AED 300 m is not the terminal alone. |
| 12 | `hellmann-calipar-healthcare-dubai-south` | Not disclosed; 31 Mar | No area; opened Mar 2026 (month) | unverified | Direct (1 of 1) | 31 Mar is the release date. Category **specialised** (judgement). |
| 13 | `lufthansa-technik-me-painting-grinding-centre-mbrah` | Not disclosed; 24 Mar | No area; inaugurated Mar 2026 (month) | not applicable | Direct (1 of 1) | Item dated 25 Mar; a painting and grinding centre added to an existing site. |
| 14 | `dp-world-al-awir-inland-container-depot` | Open depot, 100,000 m² site; August | 100,000 m² `unspecified` (depot; basis not stated); opened by Aug 2026 (month of release) | not applicable | Direct (1 of 1) | The release says "has also opened" without a date. |
| 15 | `aldar-logistics-centres-nip-phase-2` | 81,500 m²; Ready Q1 2027 | 81,000 m² `gla` (Aldar 9M 2024 presentation, indexed); under construction; forecast Q1 2027 | confirmed (Aldar leasing page) | Milestone indexed | **81,500 is derived** (148,500 − 67,000, across bases) and is not stored. |
| 16 | `terralogix-logistics-park-phase-1` | 53,360 m²; Ready Q4 2026 | 53,360 m² `unspecified`; under construction; forecast Q4 2026 | **probable** (developer site, indexed only) | **Indexed only** (0 of 3) | "Phase 1 of 3" unsourced. |
| 17 | `talal-group-central-distribution-centre-dic` | 32,500 m²; Started 21 Jul | 32,516.06 m² `mixed_building_area` (including HQ, cash-and-carry store and customer centre); AED 150 m; forecast Q3 2027 | unverified | Direct (1 of 1) | The figure is mixed built-up area. |
| 18 | `hellmann-indu-automotive-hub-jafza` | 27,900 m²; Started 8 Jun | 27,870.91 m² `unspecified` ("total area of nearly 300,000 sq ft" of "the site") | unverified | Direct (1 of 1) | May be site area. |
| 19 | `dp-world-lintara-jafza-dg-logistics-centre` | 20,000 m²; Ready Q1 2027 | 20,000 m² `unspecified`; forecast Q1 2027 | confirmed (DP World release) | Direct (1 of 1) | A MEED snippet gives 43,000 m² (unresolved). |
| 20 | `emirates-engineering-complex-dubai-south` | USD 5.1 bn; Started 18 May, due mid-2030 | 380,000 m² `unspecified` ("storage and logistics capacity") + 1.1 m m² `unspecified`; USD 5.1 bn (whole MRO complex); no forecast stored | not applicable | Direct (3 of 3) | Emirates gives "by middle of 2030" (May) and "mid-2030s" (Nov). |
| 21 | `dp-world-dubai-food-district-al-aweer` | 2,690,000 m²; District, 22 Jan | 2,694,188.16 m² `district_area`; proposed; `netNew` no (includes the existing market) | not applicable | Direct (1 of 1) | The figure is the whole district. |
| 22 | `gargash-prime-jingdong-dubai-logistics-facility` | 232,000 m²; Land, MoU 15 Oct | 232,257.6 m² `site_land_area`; MoU 13 Oct 2026 | unverified | Direct (1 of 1) | The MoU was signed 13 Oct (15 Oct is the announcement). The source converts the area as "~250,000 sqm". |
| 23 | `gallega-finished-vehicles-hub-jafza` | 92,900 m²; Yard, 15 Apr | 92,903.04 m² `unspecified`; proposed; operations were due May 2026 | not applicable | **Indexed only** (0 of 2) | The source does not state a yard basis, so the record says `unspecified` (§7). It may already be operating. |
| 24 | `phoenix-aviation-mro-centre-mbrah` | 71,000 m²; Signed 30 Oct | Four sourced components as `unspecified` (35,000 hangar; 18,000 delivery centre; 15,000 workshops and stores; 3,000 offices); no total stored | not applicable | Direct (1 of 1) | 71,000 is a derived sum, not a measure. |
| 25 | `dubai-commercity-the-hive` | 5,600 m²; Floor, 4 Oct | 5,600 m² `unspecified`; proposed; investment recorded as undisclosed (Dh1.8 bn covers all of phase two) | unverified | Direct (1 of 1) | "2027 to 2028" covers all of phase two, not The Hive alone. |
| 26 | `dp-world-mol-jebel-ali-vehicle-processing` | Not disclosed; Term sheet 6 Oct | No area; term sheet Oct 2026 (announced 7 Oct per MarkLines, indexed); MoU Dec 2023 | not applicable | **Indexed only** | No source for 6 Oct. |

**Umbrellas** (never counted):

* `aldar-logistics-centres-nip`: 148,530 m² `warehouse_gfa` ("Total GFA" on
  Aldar's leasing page; the portfolio page rounds to 148,500), 144,000 m²
  `unspecified` (July 2024 announcement) and a 220,000 m² plot. Phases: rows
  1 and 15.
* `terralogix-logistics-park-warsan`: 182,000 m² `gla` and 3.3 m sq ft
  `unspecified` (indexed only). Phase: row 16.

**Further projects found while seeding** (the PDF listed them apart as
unconfirmed; every field follows the sources and they are counted by status
like any other record — two under construction, one investment committed):

| Project id | Status | Evidence position |
|---|---|---|
| `cwt-sml-toll-dc6-dubai-south` | under construction | Completion was due Aug 2026 (Dubai South page, read while seeding); no completion found. Areas: 25,000 m² `unspecified` and 15,620 m² `mixed_building_area`. |
| `dhl-supply-chain-dubai-south-multi-user-warehouse` | investment committed | The Q1 2026 groundbreaking is unconfirmed (one secondary report says construction began). Completion due summer 2027. 55,000 m² `unspecified` (no GFA stated), EUR 120 m. |
| `mbrah-sky-support-complex` | under construction | Due by end of Q3 2026 (Dubai South, 28 Jul 2026, read while seeding); no completion found. 16,661 m² `unspecified`. |

## 3. Strict 2026 metrics vs the PDF totals (after the 12 Nov audit)

From `computeMetrics(projects, 2026)`. Population: 29 countable Dubai
projects (31 less the 2 umbrellas). Full detail in `docs/AUDIT_2026-11.md` §6.

### Delivered in 2026 (14 projects: PDF rows 1–14)

11 operational with explicit opening evidence, 3 construction completed only
(rows 1, 2, 7). Grade A: confirmed 3 (rows 1, 3, 7), probable 1 (row 8),
other 10.

| Basis | Total | Projects |
|---|---|---|
| Warehouse GFA | **26,012.85 m²** | row 4 |
| GLA | **20,000 m²** | row 7 (Grade A confirmed) |
| Mixed building area | **10,405.14 m²** | row 8 (Grade A probable) |
| Unspecified (never floor space) | 305,196.08 m² | rows 1, 2, 3, 5, 6, 9, 10 (PDI), 14 |
| Site / land | 31,679.94 m² | rows 8, 10 |
| Open yard | 18,580.61 m² | row 4 |

The old PDF reported 261,600 m² of floor space opened (not reproduced). Since
the consistency repair, the site shows warehouse floor area per basis for the
10 warehouse-type facilities only: 26,013 m² GFA · 20,000 m² GLA · 10,405 m²
built-up (mixed use) · 204,174 m² basis not stated (rows 1, 2, 3, 5, 6, 9).
The Al Awir depot (row 14) and MOSOLF's PDI warehouse (row 10, a secondary
measure) are not warehouse floor figures.

### Being built (current status `under_construction`: 8 projects)

| Basis | Total | Projects |
|---|---|---|
| GLA | 81,000 m² | row 15 |
| Mixed building area | 48,136.06 m² | row 17 (32,516.06), Toll DC6 (15,620) |
| Unspecified | 1,242,891.91 m² | rows 16, 18, 19, 20 (1.1 m), Toll DC6 (25,000), Sky Support |

The old PDF reported 215,260 m² for rows 15–19 (not reproduced). The site
shows, for warehouse-type facilities being built: 81,000 m² GLA (NIP phase 2)
· 48,136 m² built-up (mixed use) · 101,231 m² basis not stated; the Emirates
complex and the Sky Support Complex are other logistics infrastructure.

### Other strict figures

* **Committed, not started:** 2 projects: Phoenix (signed agreement; four
  component areas, `unspecified`) and DHL (investment committed; 55,000 m²
  `unspecified`, 96,000 m² plot).
* **Non-binding:** 5 projects. Proposed: rows 21, 23 and 25; MoU: row 22;
  term sheet: row 26.
* **2026 investment announcements:** 7 projects with an announcement, MoU,
  term-sheet or agreement event in 2026, none with a disclosed value.
* **Projects with at least one directly read source:** 24 of 29 included.
  Indexed only: rows 5, 16, 23 and 26, and DHL.

## 4. Pending review (14 items, all `open`)

| Item | Kind | Why it is held |
|---|---|---|
| dnata: proposed `status: operational` | conflict | The PDF says opened; both copies of the 5 Nov release say "commissioning". |
| Emirates Snack Foods: proposed `status: operational` | conflict | Aldar gives completion (Q2) and income, but no opening. |
| Aldar 7 Central (DIP) | new project | Existing stock acquired Jan 2024; no 2026 milestone. |
| Arcapita / Lintara GCC programme | new project | No source on the programme found. Its Dubai facilities are already rows 3 and 19, so adding it would double count them. |
| Iron Mountain / Unilever, EZDubai (37,000 m², opened 9 Nov 2026) | new project | Search results only (WAM needs JavaScript); sq m vs sq ft conflict. |
| Aramex healthcare hub, Dubai South (5,600 m², opened Mar 2026) | new project | Gulf News was read directly, but no official page was; Aramex's own page points to Dubai Logistics City. |
| DP World multi-tenant warehouses, Jafza (Group Amana) | new project | MEED via search only; scope of the 141,916 m² is unclear. |
| DP World chemical warehousing, Jafza North | new project | A GPCA headline only; no area; opening unconfirmed. Distinct from row 19. |
| Dubai CommerCity phase two (AED 1.8 bn, 91,000 m²) | new project | Overlaps row 25 (The Hive); the area is mixed use. |
| Legend Holding automotive hub, Jafza | new project | Announced Dec 2025; April 2026 first stage unconfirmed. |
| Cars24 hub, NIP | new project | Announced Oct 2025; August 2026 operations unconfirmed. |
| Kuehne+Nagel build-to-suit, Dubai South | new project | Handover was due Q2 2025; unconfirmed. |
| MBRAH new Suppliers Complex (88 units) | new project | Read directly (2 Sep 2026), but no area; due end of 2026. |
| DHL Global Forwarding "25,000 m² hub" | new project | Aggregator claim only. |

Duplicate checks against the PDF rows: the Gallega Aftermarket Hub (Feb 2026)
was merged into row 6. The DP World / Lintara centre is row 19, not a new
item. The Hellmann automotive hub is row 18. The Hive sits in row 25, with
phase two held. The MOL hub is row 26.

**Added after the PDF:** none. No candidate had an official page, read in
this session, that confirmed identity, location, area and milestone.

## 5. Validation warnings (all expected)

| Code | Project | Why it is acceptable |
|---|---|---|
| FORECAST_OVERDUE | `gallega-finished-vehicles-hub-jafza` | Operations were due May 2026 and are unconfirmed; the record shows this as an open question. |
| FORECAST_OVERDUE | `cwt-sml-toll-dc6-dubai-south` | Completion was due Aug 2026 and is unconfirmed; shown as "Forecast Aug 2026 (date passed)". |
| FORECAST_OVERDUE | `mbrah-sky-support-complex` | Completion was due by end of Q3 2026 and is unconfirmed; shown as "Forecast Q3 2026 (date passed)". |
| MULTIPLE_AREAS_SAME_BASIS | `emirates-engineering-complex-dubai-south` | 380,000 m² capacity and the 1.1 m m² complex are both `unspecified`; never floor space. |
| MULTIPLE_AREAS_SAME_BASIS | `phoenix-aviation-mro-centre-mbrah` | Four sourced components, none with a stated basis; the PDF's sum is not stored. |
| SHARED_SOURCE_URL | NIP umbrella and phase 1, Emirates Snack Foods | Aldar's Q3 2026 results release covers both Aldar facilities. |
| SHARED_SOURCE_URL | NIP umbrella, Emirates Snack Foods | Aldar's portfolio page lists both assets. |

## 6. Pages read directly while seeding (11 Nov 2026)

| Page | Result |
|---|---|
| dnata.com: Emirates Group H1 2026-27 release (dnata copy) | Read: "…commissioning its new AED 100 million (US$ 27 million) logistics facility in Dubai South…" (new source, direct) |
| mediaoffice.ae: the same release | Read; identical wording (upgraded from indexed to direct) |
| dnata.com: 5 Dec 2024 release | Read: groundbreaking, AED 100 m, "completion scheduled for November 2025" |
| dnata.com: newsroom (all and cargo) and FY 2025-26 results | Read: no standalone opening release; the FY results do not mention the facility |
| dubaisouth.ae: Sky Support Complex update (28 Jul 2026) | Read (new source, direct) |
| dubaisouth.ae: Toll DC6 groundbreaking | Read (upgraded from indexed to direct): 25,000 m², warehouse, mezzanine and offices, completion August 2026 |
| dubaisouth.ae: newsroom; MBRAH Suppliers Complex (2 Sep 2026) | Read (pending item) |
| gulfnews.com: Aramex healthcare hub (17 Mar 2026) | Read (pending item) |
| emirates.com: H1 release | Empty reply from the server; not retried. The emirates.com copy read by the research worker is used for the Emirates complex. |
| aldar.com: Q3 2026 release | 403; not retried. The research worker's direct read and saved text are used. |
| dpworld.com: UAE releases list | The list is rendered with JavaScript; no MOL, Group Amana or Jafza North release found. |
| jafza.ae: news list | No Gallega Finished Vehicles Hub item. |

## 7. Decisions and what could not be verified

**Superseded by the 12 Nov 2026 audit** (`docs/AUDIT_2026-11.md`): event
dates taken from a release dateline are now stored with month precision;
Emirates Snack Foods Grade A is confirmed (Aldar: "The Grade A facility");
Palmon and Terralogix Grade A are probable, not confirmed; DSV opened on
20 May 2026 per DSV; row 24 no longer stores a derived sum; MOSOLF's PDI
warehouse, DHL's warehouse, Al Awir's depot and Emirates' 380,000 m² are
`unspecified`; no Emirates completion forecast is stored. The notes below are
the original seeding decisions, kept for the record.

* **`presentedMilestone`** (removed in the consistency repair). It kept the
  PDF's "13 + 1" split; the site now counts by status only (11 + 3).
* **dnata status: construction completed.** The 5 Nov 2026 release says
  "commissioning", which is neither "commissioned" nor "was commissioning".
  The data model maps commissioning to construction completed unless a
  source says operations began, and none does. The completion is stored with
  year precision (2026) because the source gives only the half-year
  (April–September), which spans two quarters.
* **Emirates Snack Foods Grade A: unverified**, not probable. The only
  wording is "delivering further Grade A facilities", and no specification
  is published.
* **Row 23 basis: `unspecified`**, not `open_yard`. The source says "a
  logistics facility spanning 1 million square feet"; the yard reading is
  the PDF's. It counts as zero floor space either way.
* **Row 24: a derived sum.** 71,000 m² `mixed_building_area` is the sum of
  four sourced components, as the brief asked; the note says it is derived.
* **Row 12 category: specialised** (judgement: healthcare distribution with
  a hazardous-goods chamber).
* **DSV forecast removed.** "Within 11 months" would have to be converted
  into a date, so no forecast is stored.
* **Coarse dates.** Release dates are used as event dates where the opening
  day is not given (rows 12 and 14, and row 8 as a publication date). Their
  `actualCompletion` is stored with month precision.
* **Not verified:** the basis of every `unspecified` area; the exact
  commissioning date for dnata; any opening date for Emirates Snack Foods;
  NIP phase 2 progress in H2 2026; anything from Terralogix (site
  unreachable); CEVA's landlord and new-build status; whether the Gallega
  vehicle hub is operating; the date of the DP World / MOL term sheet;
  completion of Toll DC6 and the Sky Support Complex; the DHL groundbreaking.
