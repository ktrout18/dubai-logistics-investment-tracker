# Seed notes: 2026 register (seeded 11 November 2026)

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
* **Counts:** 31 projects (26 PDF rows, 2 umbrellas, 3 "not counted"
  items), 14 pending-review items, 0 regional (non-Dubai) projects.
  `npm run validate`: 0 errors, 5 warnings (§5).

## 1. Two views of the same data

| | Briefing view ("as reported") | Strict view |
|---|---|---|
| Function | `computePresentedTotals(projects, 2026)` | `computeMetrics(projects, 2026)` |
| Area | Adds the figure the PDF charts (`presentation.presentedAreaM2`) for rows inside the PDF subtotals, whatever its basis | One number per measurement basis; only `warehouse_gfa` and `gla` count as warehouse floor space; `mixed_building_area` is a separate labelled number; land, yard, district and unspecified never count |
| Opened or completed | The PDF's own split (`presentation.presentedMilestone`) | `status` from the latest sourced event |
| Labels | PDF wording (`descriptor`, `areaLabel`, `dateLabel`) | Source wording (`summary`, events, area notes) |

The briefing view reproduces the PDF exactly:

| PDF figure | `computePresentedTotals` |
|---|---|
| Openings floor area 261,600 m² across ten disclosed facilities | `openings.floorAreaM2` = 261,600; `disclosedFloorCount` = 10 |
| "Opened 13 … and completed one more" (Aldar NIP phase 1) | `openedCount` = 13; `completedOnlyCount` = 1 |
| Being built 215,260 m² (rows 15–19) | `beingBuilt.floorAreaM2` = 215,260 |

`statusCompletedOnlyCount` = 3. Under the strict status, rows 1, 2 and 7 are
"construction completed": the sources confirm completion, but not opening,
for dnata (row 2) and Emirates Snack Foods (row 7). Each of these rows
explains the gap in `differsFromSources`.

## 2. All 26 PDF rows

Verification: **direct** means the page text was read, either by the
research worker or while seeding. **indexed** means the page was seen only in
search results. "Milestone" is the verification level of the source behind
the latest event. Grade A: **confirmed** only where a developer or official
source uses the words "Grade A" (quoted in `gradeAEvidence`).

| Ref | Project id | PDF figure | Structured figure / basis | Grade A | Verification | Differences from the PDF |
|---|---|---|---|---|---|---|
| 1 | `aldar-logistics-centres-nip-phase-1` | 67,000; Q3, completed | 67,000 m² `unspecified`; construction completed Q3 2026 | confirmed (Aldar Q3 2026) | Milestone direct; area indexed (2 of 4 sources direct) | The basis of 67,000 is stated in no page read; the figure comes only from search snippets of the Nov 2025 release. A phase of the NIP umbrella. |
| 2 | `dnata-logistics-dubai-south-warehouse` | 57,000; Apr to Sep | 57,000 m² `unspecified`; AED 100 m; commissioned in 2026 (year precision) → construction completed | unverified | Direct (3 of 4); two copies of the 5 Nov release read while seeding | The PDF says opened; the source says "commissioning". `netNew` is unknown: completion was due Nov 2025, so the building may predate 2026. |
| 3 | `dsv-lintara-jafza-build-to-suit-warehouse` | 30,000; 20 May | 30,000 m² `unspecified`; opened 21 May 2026 | confirmed (DSV/Arcapita release) | Direct (2 of 3) | Sources say build-to-suit for DSV, not "multiuser"; the date is 21 May, not 20 May. |
| 4 | `al-sharqi-shipping-dic-logistics-hub` | 26,000; 15 Oct | 26,012.85 m² `warehouse_gfa` (280,000 sq ft built-up storage) + 18,580.61 m² `open_yard`; AED 70 m | unverified | Direct (1 of 1) | The PDF omits 30,000 sq ft of offices and a 40,000 sq ft basement (noted). |
| 5 | `ceva-logistics-dubai-south-ecommerce-warehouse` | 23,000; 15 Jan | 23,000 m² `unspecified`; opened Jan 2026 (month) | unverified | **Indexed only** (0 of 2) | Trade press only; the building probably predates 2026, so `netNew` is unknown. |
| 6 | `gallega-global-logistics-jafza-3pl-hub` | 20,000; 20 May | 19,974.15 m² `unspecified` (215,000 sq ft); opened 20 May 2026 | unverified | Direct (3 of 3) | The source mentions open storage; enclosed floor area is not confirmed. Merged with the Feb 2026 "Aftermarket Hub" (same size, same partners). |
| 7 | `emirates-snack-foods-cold-store-dubai-south` | 20,000; Q2 | 20,000 m² `gla` ("leasable area of almost 20,000 sqm"); construction completed Q2 2026 | unverified (only "further Grade A facilities" is said; no specification published) | Direct (3 of 3) | The basis is GLA. The PDF says opened; Aldar gives only completion and rental income. |
| 8 | `palmon-manrre-jafza-chemical-storage-hub` | 10,400; 14 Jan | 10,405.14 m² `mixed_building_area` (112,000 sq ft built-up, including offices) + 16,722.55 m² `site_land_area`; USD 11 m | confirmed (Manrre REIT: "Grade A asset") | Direct (2 of 2) | Owner is GFH Partners Manrre REIT; operator is Safe Logistics. The inauguration day is not stated. |
| 9 | `dior-regional-distribution-centre-ezdubai` | 7,200; 21 Sep | 7,200 m² `unspecified` (two levels) | unverified | Direct (1 of 1) | None |
| 10 | `mosolf-automotive-hub-jafza` | 1,000; March | 1,021.93 m² `warehouse_gfa` (PDI warehouse) + 14,957.39 m² `site_land_area` | not applicable | Direct (1 of 1) | None (the PDF footnote matches) |
| 11 | `petrochem-jebel-ali-terminal-and-hq` | Not disclosed (AED 300 m); 14 Jan | No area; AED 300 m | not applicable | Direct (1 of 1) | The AED 300 m includes the HQ and offices. |
| 12 | `hellmann-calipar-healthcare-dubai-south` | Not disclosed; 31 Mar | No area; opened Mar 2026 (month) | unverified | Direct (1 of 1) | 31 Mar is the release date. The PDF gives no category; set to **specialised** (judgement). |
| 13 | `lufthansa-technik-me-painting-grinding-centre-mbrah` | Not disclosed; 24 Mar | No area; opened 25 Mar 2026 | not applicable | Direct (1 of 1) | The source date is 25 Mar. It is a painting and grinding centre added to an existing site. |
| 14 | `dp-world-al-awir-inland-container-depot` | Open depot, 100,000 m² site; August | 100,000 m² `open_yard`; opened Aug 2026 (month) | not applicable | Direct (1 of 1) | None |
| 15 | `aldar-logistics-centres-nip-phase-2` | 81,500 m²; Ready Q1 2027 | 81,000 m² `gla` (Aldar 9M 2024 presentation); under construction; forecast Q1 2027 | confirmed (Aldar leasing page) | Milestone indexed (2 of 5 direct) | The PDF's **81,500 is derived** (148,500 − 67,000); Aldar's own figure is about 81,000 m² GLA (search snippet). |
| 16 | `terralogix-logistics-park-phase-1` | 53,360 m²; Ready Q4 2026 | 53,360 m² `unspecified`; under construction; forecast Q4 2026 | confirmed (developer site, **indexed only**) | **Indexed only** (0 of 3) | The target moved from Q3 to Q4 2026. "Phase 1 of 3" is not confirmed. A phase of the Terralogix umbrella. |
| 17 | `talal-group-central-distribution-centre-dic` | 32,500 m²; Started 21 Jul | 32,516.06 m² `mixed_building_area` (including HQ, cash-and-carry store and customer centre); AED 150 m; forecast Q3 2027 | unverified | Direct (1 of 1) | The figure is mixed built-up area. |
| 18 | `hellmann-indu-automotive-hub-jafza` | 27,900 m²; Started 8 Jun | 27,870.91 m² `unspecified` ("total area of nearly 300,000 sq ft" of "the site") | unverified | Direct (1 of 1) | May be site area. |
| 19 | `dp-world-lintara-jafza-dg-logistics-centre` | 20,000 m²; Ready Q1 2027 | 20,000 m² `unspecified`; forecast Q1 2027 | confirmed (DP World release) | Direct (1 of 1) | A MEED snippet gives 43,000 m² (unresolved). |
| 20 | `emirates-engineering-complex-dubai-south` | USD 5.1 bn; Started 18 May, due mid-2030 | 380,000 m² `mixed_building_area` (storage and logistics capacity) + 1.1 m m² `unspecified`; USD 5.1 bn | not applicable | Direct (3 of 3) | The 5 Nov 2026 Group results say "mid-2030s". |
| 21 | `dp-world-dubai-food-district-al-aweer` | 2,690,000 m²; District, 22 Jan | 2,694,188.16 m² `district_area`; proposed; `netNew` no (includes the existing market) | not applicable | Direct (1 of 1) | The figure is the whole district. |
| 22 | `gargash-prime-jingdong-dubai-logistics-facility` | 232,000 m²; Land, MoU 15 Oct | 232,257.6 m² `site_land_area`; MoU 13 Oct 2026 | unverified | Direct (1 of 1) | The MoU was signed 13 Oct (15 Oct is the announcement). The source converts the area as "~250,000 sqm". |
| 23 | `gallega-finished-vehicles-hub-jafza` | 92,900 m²; Yard, 15 Apr | 92,903.04 m² `unspecified`; proposed; operations were due May 2026 | not applicable | **Indexed only** (0 of 2) | The source does not state a yard basis, so the record says `unspecified` (§7). It may already be operating. |
| 24 | `phoenix-aviation-mro-centre-mbrah` | 71,000 m²; Signed 30 Oct | 71,000 m² `mixed_building_area`, a **derived sum** of hangar, delivery centre, workshops and stores, and offices; forecast Q1 2029 | not applicable | Direct (1 of 1) | The source states no total. |
| 25 | `dubai-commercity-the-hive` | 5,600 m²; Floor, 4 Oct | 5,600 m² `unspecified`; proposed; investment recorded as undisclosed (Dh1.8 bn covers all of phase two) | unverified | Direct (1 of 1) | "2027 to 2028" covers all of phase two, not The Hive alone. |
| 26 | `dp-world-mol-jebel-ali-vehicle-processing` | Not disclosed; Term sheet 6 Oct | No area; term sheet Oct 2026 (month); MoU Dec 2023 | not applicable | **Indexed only** (0 of 3) | No source found for 6 Oct. |

**Umbrellas** (no presentation; never counted):

* `aldar-logistics-centres-nip`: 148,530 m² `warehouse_gfa` ("Total GFA" on
  Aldar's leasing page; the portfolio page rounds to 148,500), 144,000 m²
  `unspecified` (July 2024 announcement) and a 220,000 m² plot. Phases: rows
  1 and 15.
* `terralogix-logistics-park-warsan`: 182,000 m² `gla` and 3.3 m sq ft
  `unspecified` (indexed only). Phase: row 16.

**Not counted** (`section: 'not_counted'`; labels from the sources, since
the PDF only names them):

| Project id | Status | Why it is not counted |
|---|---|---|
| `cwt-sml-toll-dc6-dubai-south` | under construction | Completion was due Aug 2026 (Dubai South page, read while seeding); no completion found. Areas: 25,000 m² `unspecified` and 15,620 m² `mixed_building_area`. |
| `dhl-supply-chain-dubai-south-multi-user-warehouse` | investment committed | The Q1 2026 groundbreaking is unconfirmed (one secondary report says construction began). Completion due summer 2027. 55,000 m² `warehouse_gfa`, EUR 120 m. |
| `mbrah-sky-support-complex` | under construction | Due by end of Q3 2026 (Dubai South, 28 Jul 2026, read while seeding); no completion found. 16,661 m² `unspecified`. |

## 3. Strict 2026 metrics vs the PDF totals

From `computeMetrics(projects, 2026)`. Population: 29 countable Dubai
projects (31 less the 2 umbrellas).

### Delivered in 2026 (14 projects: PDF rows 1–14)

| Basis | Grade A confirmed (3: rows 1, 3, 8) | Other (11) | Total |
|---|---|---|---|
| Warehouse GFA | 0 | 27,034.78 m² (rows 4, 10) | **27,034.78 m²** |
| GLA | 0 | 20,000 m² (row 7) | **20,000 m²** |
| Mixed building area | 10,405.14 m² (row 8) | 0 | **10,405.14 m²** |
| Unspecified (never floor space) | 97,000 m² (rows 1, 3) | 107,174.15 m² (rows 2, 5, 6, 9) | 204,174.15 m² |
| Site / land | 16,722.55 m² | 14,957.39 m² | 31,679.94 m² |
| Open yard | 0 | 118,580.61 m² (rows 4, 14) | 118,580.61 m² |

The PDF reports **261,600 m²** of floor space opened. The strict figure is
**27,035 m² warehouse GFA + 20,000 m² GLA**, plus 10,405 m² of mixed building
area reported separately. The gap is intended:

* **204,174 m² has no stated basis** (rows 1, 2, 3, 5, 6, 9). These sources
  give a size ("57,000m² warehouse", "30,000-square-metre warehouse",
  "spanning 7,200 square metres") without saying whether it is GFA, GLA or
  plot. The data model never assumes GFA, so these stay `unspecified` and
  sit outside floor-space totals.
* **Row 8 (10,400)** is built-up area that includes offices, so it is
  `mixed_building_area`, reported separately.
* **Row 7 (20,000)** is GLA, which is reported separately from GFA and never
  added to it.
* The PDF's rounding (for example 26,000 vs 26,013 and 1,000 vs 1,022)
  accounts for a few m².
* There are no Grade A "probable" calls. "Probable" needs published
  specifications, and none were found.

The Grade A confirmed bucket holds 3 delivered projects, none of them with a
GFA or GLA figure.

### Being built (current status `under_construction`: 8 projects)

| Basis | Total | Projects |
|---|---|---|
| GLA | 81,000 m² | row 15 |
| Mixed building area | 428,136.06 m² | rows 17 (32,516), 20 (380,000), Toll DC6 (15,620) |
| Unspecified | 1,242,891.91 m² | rows 16, 18, 19, 20 (1.1 m), Toll DC6 (25,000), Sky Support |

The PDF reports **215,260 m²** for rows 15–19. Strictly, only the 81,000 m²
GLA of NIP phase 2 is warehouse floor space. Row 17 is mixed building area,
rows 16, 18 and 19 have no stated basis, and the strict population also
includes row 20 and the two overdue not-counted items. The PDF's 81,500 for
row 15 is its own subtraction, so the strict figure (81,000) comes from
Aldar's 2024 presentation instead.

### Other strict figures

* **Committed, not started:** 2 projects: Phoenix (signed agreement; 71,000
  m² mixed, derived) and DHL (investment committed; 55,000 m² GFA).
* **Non-binding:** 5 projects. Proposed: rows 21, 23 and 25; MoU: row 22;
  term sheet: row 26.
* **2026 investment announcements:** 7 projects with an announcement, MoU,
  term-sheet or agreement event in 2026, none with a disclosed value. The
  disclosed amounts in the register (dnata, Al Sharqi, Palmon, Petrochem,
  Talal, Emirates, DHL) belong to delivery or construction events, or to
  announcements from before 2026.
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
| FORECAST_OVERDUE | `cwt-sml-toll-dc6-dubai-south` | Completion was due Aug 2026 and is unconfirmed (the reason the PDF does not count it). |
| FORECAST_OVERDUE | `mbrah-sky-support-complex` | Completion was due by end of Q3 2026 and is unconfirmed (the reason the PDF does not count it). |
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

* **`presentedMilestone` (additive schema field).** The brief defined
  `completedOnlyCount` by status. With the sources as they stand, that gives
  11 opened and 3 completed-only, not the PDF's 13 + 1. The new field keeps
  the briefing view "as reported", consistent with the area convention, and
  `statusCompletedOnlyCount` keeps the strict number visible.
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
