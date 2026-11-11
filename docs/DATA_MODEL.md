# Data model and shared module API

This is the contract between the data files, the web UI and the ingestion
pipeline. Everything here is implemented in `shared/` (pure TypeScript + zod,
no Node or DOM APIs; enforced by ESLint) and exported from
`shared/index.ts`:

```ts
import { computeMetrics, validateRegister, ProjectSchema, type Project } from '../shared/index.ts';
```

Imports use explicit `.ts` extensions (`allowImportingTsExtensions`); Vite,
vitest and tsx all resolve them.

---

## 1. Files

| File | Owner | Shape (zod schema) |
|---|---|---|
| `data/register.json` | pipeline + manual edits | `RegisterFileSchema` → `{ schemaVersion: 1, updatedAt?, projects: Project[] }` |
| `data/pending-review.json` | pipeline | `PendingReviewFileSchema` → `{ schemaVersion: 1, items: PendingReviewItem[] }` |
| `data/changelog.json` | pipeline + manual edits | `ChangelogFileSchema` → `{ schemaVersion: 1, changes: ChangeRecord[] }` |
| `data/meta.json` | pipeline | `MetaFileSchema` → `MetaFile` |
| `data/sources.json` | pipeline worker (content) | `SourcesFileSchema` → `{ schemaVersion: 1, sources: { id, name, ...anything }[] }` (passthrough) |

`DATA_FILES` maps keys (`register`, `pendingReview`, `changelog`, `meta`,
`sources`) to these paths. `SCHEMA_VERSION` is `1`.

* `data/` is the only canonical copy. `npm run sync-data` (run automatically
  by `predev` and `prebuild`) copies it to `public/data/` (git-ignored), so the
  site fetches `./data/*.json` at runtime and the built site ships them under
  `dist/data/`. A data-only commit + rebuild updates the site; the JSON
  download link can point straight at `./data/register.json`.
* Write files with `serializeDataFile(obj)` (2-space indent, trailing newline)
  so diffs stay minimal.
* All schemas are `.strict()` (unknown keys are errors) except `sources.json`
  entries.

### Conventions

* **Dates** are `YYYY-MM-DD`. When only a month/quarter/year is known, store
  the **first day of the period** and set `datePrecision` (`day | month |
  quarter | year`). The validator warns otherwise
  (`DATE_PRECISION_NOT_NORMALISED`). Use `periodStart` / `periodEnd`.
* **Timestamps** (`createdAt`, `updatedAt`, `appliedAt`, run times) are ISO
  8601 with an offset, e.g. `2026-11-11T06:00:00Z`.
* **URLs** must be absolute `http(s)` (checked by the validator, `INVALID_URL`).
* **Money** amounts are in full currency units (not millions).
* **Areas** are stored in m² (`valueM2`), with the source's original figure
  and unit kept alongside.

---

## 2. Project

`ProjectSchema` / `type Project`. Optional fields are marked `?`.

| Field | Type | Notes |
|---|---|---|
| `id` | slug | Lower-case `a-z0-9` with single hyphens, 3–100 chars. Stable, **never reused** (see `ids.ts`). |
| `name` | string | Display name. |
| `facilityName?` | string | Facility's own name if different. |
| `summary` | string | One-paragraph neutral description. |
| `developer?`, `investor?`, `owner?`, `operator?` | string | Display spellings. |
| `companies` | string[] | Normalised, de-duplicated list for filtering. Build with `deriveCompanies(p, extra?)`. Must include each role company (`COMPANIES_MISSING_ROLE`). |
| `emirate` | `Emirate` | Non-Dubai = regional context (derived by `isRegional(p)`); never in Dubai totals. |
| `location` | string | Free text (area/landmark). |
| `zone?` | string | Industrial zone. Free string; normalise with `normaliseZone()` to the `KNOWN_ZONES` canonical spelling. |
| `sectors` | `Sector[]` (≥1) | |
| `assetType` | `AssetType` | |
| `status` | `ProjectStatus` | Must equal the status implied by replaying `events`. |
| `originalAnnouncement?` | `{ date, datePrecision, sourceUrl, sourceTitle? }` | |
| `latestMilestone` | `{ date, datePrecision, description, sourceUrl }` | Must not be older than the newest event; should match an event (same date + URL). |
| `investment?` | `Investment` | See below. |
| `areas` | `AreaMeasure[]` | See below. May be empty. |
| `primaryAreaIndex?` | int | Index into `areas` of the measure representing the facility's floor space. |
| `gradeA` | `confirmed | probable | unverified | not_applicable` | `confirmed` **requires** `gradeAEvidence`. |
| `gradeAEvidence?` | string | Why the grade was assigned. |
| `netNew` | `yes | no | unknown` | New supply relative to `NET_NEW_BASELINE_DATE` = 2025-12-31. |
| `netNewEvidence?` | string | Expected when `netNew` is yes/no. |
| `forecastCompletion?` | `{ date, datePrecision, sourceUrl? }` | A forecast. **Never** counts as delivery. |
| `actualCompletion?` | `{ date, datePrecision, sourceUrl }` | Source is mandatory. Required when status is `construction_completed`/`operational`; forbidden otherwise. |
| `sources` | `Source[]` (≥1) | Every URL cited elsewhere in the project should appear here. |
| `lastVerified` | date | Not in the future. |
| `confidence` | `high | medium | low` | |
| `unresolvedQuestions` | string[] | Open issues shown to readers. |
| `events` | `ProjectEvent[]` | Chronological (ascending date). |
| `parentId?` | slug | This project is a phase of `parentId`. |
| `phaseLabel?` | string | e.g. "Phase 1". Expected whenever `parentId` is set. |
| `provenance` | `seed_pdf | manual | pipeline` | |
| `seedNote?` | string | Original PDF wording / qualifications. |
| `presentation?` | `Presentation` | Briefing-view labels reproducing the owner's Nov 2026 PDF ("as reported"). Never used by strict metrics. See §2a. |
| `createdAt`, `updatedAt` | timestamp | `updatedAt ≥ createdAt`. |

### Investment

| Field | Notes |
|---|---|
| `amount?` | Required when `disclosed`; forbidden when not. |
| `currency?` | ISO 4217 (`AED`, `USD`, ...). Required when `disclosed`. |
| `amountAed?` | Only when the source states it, the currency is AED, or USD via the 3.6725 peg (`AED_PER_USD`). Never invent other conversions. |
| `amountAedDerivation?` | `stated_in_source | native_aed | usd_peg`. Required whenever `amountAed` is present. `usd_peg` requires `currency: 'USD'` and `amountAed = amount × 3.6725`; `native_aed` requires `currency: 'AED'` and `amountAed = amount`. |
| `basis` | Free-text note on what the amount covers. |
| `disclosed` | `false` = investment exists but no value published. |
| `sourceUrl?` | Required when `disclosed` (`INVESTMENT_UNSOURCED`). |

### AreaMeasure

| Field | Notes |
|---|---|
| `valueM2` | > 0. Exact conversion of `originalValue` when given (tolerance max(1 m², 0.1 %)). |
| `basis` | `AreaBasis` — see table below. |
| `label?`, `note?` | e.g. "Phase 1 GFA", "source says 'up to'". |
| `originalValue?`, `originalUnit?` | Given together. Units: `sqm | sqft | hectare | acre`. |
| `sourceUrl?` | Required by the validator (`AREA_UNSOURCED` is an error). |

| `AreaBasis` | Meaning | Enters warehouse floor-space metrics? |
|---|---|---|
| `warehouse_gfa` | Warehouse gross floor area | Yes — reported as its own number |
| `gla` | Gross leasable area | Yes — reported as its own number (never added to GFA) |
| `mixed_building_area` | Building area incl. offices etc., not separable | Reported separately, labelled as mixed |
| `site_land_area` | Plot / land | Never |
| `open_yard` | Open storage yard | Never |
| `district_area` | Masterplan / district | Never |
| `unspecified` | Source does not say | Never |

Constants: `WAREHOUSE_FLOOR_BASES = ['warehouse_gfa','gla']`,
`MIXED_BUILDING_BASES = ['mixed_building_area']`,
`NON_FLOOR_BASES = ['site_land_area','open_yard','district_area','unspecified']`.

### Source

`{ url, title?, publisher?, publishedDate?, type: primary | secondary, accessedDate?, verification: direct | indexed | inferred }`
— `direct` = page read; `indexed` = seen only via a search index/snippet;
`inferred` = deduced from other evidence. If `publishedDate` of the source
cited by `actualCompletion` is earlier than the completion period, it is an
error (`ACTUAL_COMPLETION_SOURCE_PREDATES`): such a source can only be a forecast.

### ProjectEvent

`{ id, date, datePrecision, type: EventType, statusAfter?, summary, sourceUrl, sourcePublishedDate?, sourceType: primary | secondary, verification }`.
`id` is unique within the project (`makeEventId`). Events must be sorted by
date and not in the future.

### Presentation (briefing view, §2a)

`PresentationSchema` / `type Presentation`, optional on a project. It holds
the owner's PDF wording and charted figures so the first public view matches
the PDF while every row still links to its strict, sourced record. Umbrellas
never carry one.

| Field | Type | Notes |
|---|---|---|
| `pdfRef?` | int 1–26 | Row in the owner's Nov 2026 PDF. Absent for `not_counted` / `added_after_pdf` rows. |
| `section` | `PresentationSection` | `openings`, `being_built`, `signed_or_announced`, `not_counted`, `added_after_pdf`. |
| `partners` | string[] | Company chips as shown, lead first. Display only (filtering uses `companies`). |
| `descriptor`, `locationLabel`, `areaLabel`, `dateLabel` | string | PDF text as shown (e.g. "Not disclosed (AED 300 m)", "Q3, completed"). |
| `presentedAreaM2?` | number | The figure the PDF charts, if any. |
| `presentedAreaKind?` | `floor | district | land | yard` | What the PDF says the figure is. |
| `countedInPresentedTotal` | boolean | True only for rows inside the PDF subtotals. |
| `category` | `grade_a_developer | other_modern | specialised | land_site_yard` | PDF colour category. |
| `sortOrder` | number | Row order within the section. |
| `presentedMilestone?` | `opened | completed_only` | Openings rows only: how the PDF counts the row ("opened 13 … and completed one more"). Default `opened`. |
| `differsFromSources?` | string | Short plain note where sources disagree with the PDF wording or figure. |

Enums: `PRESENTATION_SECTIONS`, `PRESENTED_AREA_KINDS`,
`PRESENTATION_CATEGORIES`, `PRESENTED_MILESTONES`, each with a `*_LABELS` map
(also in `ENUM_LABELS` as `presentationSection`, `presentedAreaKind`,
`presentationCategory`, `presentedMilestone`).

**"As reported" vs strict.** `computePresentedTotals` (below) adds up
`presentedAreaM2` across rows regardless of the source's measurement basis,
and splits opened / completed-only by `presentedMilestone`, not by `status`.
That reproduces the PDF; it is explicitly **not** a like-for-like metric.
Strict figures come only from `computeMetrics`. Where the strict status is
only `construction_completed` for a row the PDF calls opened (e.g. a source
says "commissioning"), `presentedMilestone` stays `opened`, the difference
goes in `differsFromSources`, and `statusCompletedOnlyCount` exposes the
strict count.

### Phasing (umbrellas)

A project that has at least one child (some project's `parentId` points at
it) is an **umbrella**. Umbrella areas and investment are **excluded from all
totals**; its phases count instead. This rule lives in exactly one place:
`isUmbrella(project, all)`, `umbrellaIdSet(all)`, `countableProjects(all)`.
Nested phases work the same way (any project with children is an umbrella;
leaves count). Validation: parent must exist, no self-parent, no cycles,
phase emirate should match parent, sum of phase areas per basis should not
exceed the parent's (warning).

---

## 3. Enums

Every enum is exported as a `const` tuple, a union type and a label map. All
label maps are also in `ENUM_LABELS` (use `labelFor(kind, value)`).

| Tuple | Type | Labels | Values |
|---|---|---|---|
| `EMIRATES` | `Emirate` | `EMIRATE_LABELS` | Dubai, Abu Dhabi, Sharjah, Fujairah, Ajman, Ras Al Khaimah, Umm Al Quwain, Other |
| `SECTORS` | `Sector` | `SECTOR_LABELS` | grade_a_warehousing, modern_warehousing, automotive_spare_parts, finished_vehicles, industrial_machinery, chemicals_dangerous_goods, fashion_luxury_ecommerce, food_fmcg_cold_chain, aerospace_air_cargo, multimodal_container_inland, other |
| `ASSET_TYPES` | `AssetType` | `ASSET_TYPE_LABELS` | warehouse, distribution_centre, fulfilment_centre, cold_store, logistics_park, vehicle_processing_centre, dangerous_goods_store, air_cargo_terminal, mro_aerospace_facility, container_terminal_or_depot, inland_port_or_rail, open_yard, mixed_industrial, other |
| `PROJECT_STATUSES` | `ProjectStatus` | `PROJECT_STATUS_LABELS` | proposed, mou, term_sheet, signed_agreement, investment_committed, under_construction, construction_completed, operational, cancelled |
| `DATE_PRECISIONS` | `DatePrecision` | `DATE_PRECISION_LABELS` | day, month, quarter, year |
| `AREA_BASES` | `AreaBasis` | `AREA_BASIS_LABELS` | see table above |
| `AREA_UNITS` | `AreaUnit` | `AREA_UNIT_LABELS` | sqm, sqft, hectare, acre |
| `GRADE_A_STATUSES` | `GradeAStatus` | `GRADE_A_LABELS` | confirmed, probable, unverified, not_applicable |
| `NET_NEW_VALUES` | `NetNew` | `NET_NEW_LABELS` | yes, no, unknown |
| `SOURCE_TYPES` | `SourceType` | `SOURCE_TYPE_LABELS` | primary, secondary |
| `VERIFICATION_LEVELS` | `VerificationLevel` | `VERIFICATION_LABELS` | direct, indexed, inferred |
| `CONFIDENCE_LEVELS` | `Confidence` | `CONFIDENCE_LABELS` | high, medium, low |
| `EVENT_TYPES` | `EventType` | `EVENT_TYPE_LABELS` | announcement, mou, term_sheet, agreement_signed, investment_committed, construction_start, construction_milestone, construction_completed, commissioned, opened, expansion, cancelled, correction, other |
| `PROVENANCES` | `Provenance` | `PROVENANCE_LABELS` | seed_pdf, manual, pipeline |
| `AED_DERIVATIONS` | `AedDerivation` | `AED_DERIVATION_LABELS` | stated_in_source, native_aed, usd_peg |
| `CHANGE_VERIFICATION_STATUSES` | `ChangeVerificationStatus` | `CHANGE_VERIFICATION_LABELS` | verified_official, verified_multiple, indexed_only, unverified |
| `APPLIED_BY_VALUES` | `AppliedBy` | `APPLIED_BY_LABELS` | pipeline, manual |
| `REVIEW_KINDS` | `ReviewKind` | `REVIEW_KIND_LABELS` | new_project, update, conflict |
| `REVIEW_STATES` | `ReviewState` | `REVIEW_STATE_LABELS` | open, accepted, rejected |
| `RUN_STATUSES` | `RunStatus` | `RUN_STATUS_LABELS` | never_run, success, partial, failed |
| `SCAN_STATUSES` | `ScanStatus` | `SCAN_STATUS_LABELS` | ok, fallback_used, failed, skipped |
| `PRESENTATION_SECTIONS` | `PresentationSection` | `PRESENTATION_SECTION_LABELS` | openings, being_built, signed_or_announced, not_counted, added_after_pdf |
| `PRESENTED_AREA_KINDS` | `PresentedAreaKind` | `PRESENTED_AREA_KIND_LABELS` | floor, district, land, yard |
| `PRESENTATION_CATEGORIES` | `PresentationCategory` | `PRESENTATION_CATEGORY_LABELS` | grade_a_developer, other_modern, specialised, land_site_yard |
| `PRESENTED_MILESTONES` | `PresentedMilestone` | `PRESENTED_MILESTONE_LABELS` | opened, completed_only |

Status groupings: `DELIVERED_STATUSES` (construction_completed, operational),
`COMMITTED_NOT_STARTED_STATUSES` (signed_agreement, investment_committed),
`NON_BINDING_STATUSES` (proposed, mou, term_sheet),
`INVESTMENT_ANNOUNCEMENT_EVENT_TYPES` (announcement, mou, term_sheet,
agreement_signed, investment_committed).

---

## 4. Other records

### ChangeRecord (`changelog.json` → `changes[]`)

`{ id, projectId, runId?, field, previousValue, newValue, evidenceUrl, evidenceDate, reason, verificationStatus, appliedAt, appliedBy }`

* `field` is a path such as `status`, `areas[0].valueM2`, `events` or `*`
  (whole project created). `previousValue`/`newValue` are any JSON (`null`
  when absent).
* `projectId` must exist in the register (`CHANGELOG_UNKNOWN_PROJECT`).
  Projects are therefore never deleted; mark them `cancelled` or correct them.
* Use `makeChangeId(rec, existingIds)` → `chg-YYYYMMDD-<fnv1a>`.

### PendingReviewItem (`pending-review.json` → `items[]`)

`{ id, createdAt, runId?, kind: new_project | update | conflict, projectId?, proposed, evidence: { url, publishedDate?, quote? }[] (≥1), reasonHeld, issueUrl?, state: open | accepted | rejected, resolvedAt?, resolutionNote? }`

* `projectId` required for `update` / `conflict` and must exist.
* `proposed`: for `new_project` a partial `Project`; otherwise a map of field
  path → proposed value. Not schema-checked beyond being an object.
* `resolvedAt` required when `state` ≠ `open`. Id: `makeReviewId(item, existing)`.

### MetaFile (`meta.json`)

`{ schemaVersion: 1, lastSuccessfulRun?, lastAttemptedRun?, lastRunStatus: RunStatus, sourceScans: SourceScan[], coverageLimitations: string[], exhaustive: false }`

`SourceScan = { sourceId, name, lastAttempt, lastSuccess?, status: ok | fallback_used | failed | skipped, method?, note? }`.
`exhaustive` is the literal `false`: the dataset must never claim completeness.

---

## 5. Counting rules (`computeMetrics`)

1. **Bases are never summed together.** Every area figure is an
   `AreaBreakdown` (one `{ totalM2, projectIds }` per basis). Warehouse floor
   space = `warehouse_gfa` and `gla`, shown as two numbers; `mixed_building_area`
   is a third, labelled number; land, yard, district and unspecified areas stay
   in their own buckets.
2. **Population:** only Dubai, countable (non-umbrella), non-cancelled projects
   enter totals. Non-Dubai projects appear only in `regionalContext` (same
   umbrella/cancelled exclusions).
3. **Delivered in year Y** = status `construction_completed` or `operational`
   **and** `actualCompletion.date` in Y. A forecast never counts.
4. **One measure per project per basis:** the `primaryAreaIndex` measure for
   its own basis, otherwise the largest measure of that basis
   (`selectAreasByBasis`). Overlapping same-basis figures are never added.
5. **Grade-A confirmed and probable are separate** figures and never merged.
6. **Investment announcements in Y:** included (rule 2) projects with at least
   one event of an `INVESTMENT_ANNOUNCEMENT_EVENT_TYPES` type dated in Y.
   Disclosed values are summed **per currency** (never converted); an
   `aedWhereAvailable` sum uses `amountAed` only where present and lists which
   were peg-derived. Umbrellas are listed in `umbrellaProjectIds` for context
   but never counted or summed (their phases carry the money).
7. Every figure carries the `projectIds` behind it so the UI can link each
   number to its evidence.

### `Metrics` shape

```ts
interface BasisTotal { totalM2: number; projectIds: string[] }          // totalM2 rounded to 2 dp
type AreaBreakdown = Record<AreaBasis, BasisTotal>;
interface ProjectBucket { projectCount: number; projectIds: string[]; areas: AreaBreakdown; withoutBuildingAreaIds: string[];
                         primaryUnspecified: BasisTotal; withoutAnyAreaIds: string[] }
interface StatusCount { count: number; projectIds: string[] }

interface Metrics {
  year: number;
  scope: { includedProjectIds; excludedUmbrellaIds; excludedCancelledIds; regionalProjectIds: string[] };
  gradeADelivered: ProjectBucket;          // delivered in year, gradeA confirmed
  gradeAProbableDelivered: ProjectBucket;  // delivered in year, gradeA probable
  otherModernDelivered: ProjectBucket;     // delivered in year, unverified / not_applicable
  underConstruction: { gradeA; gradeAConfirmed; gradeAProbable; other; all: ProjectBucket };   // current status
  committedNotStarted: ProjectBucket & { byStatus: { signed_agreement: StatusCount; investment_committed: StatusCount } };
  nonBinding: StatusCount & { byStatus: { proposed; mou; term_sheet: StatusCount } };
  investmentAnnouncements: {
    year; eventTypes; projectCount; projectIds; eventCount;
    events: { projectId; eventId; type; date }[];
    disclosed: { projectCount; projectIds; byCurrency: Record<string, { total: number; projectIds: string[] }>;
                 aedWhereAvailable: { total; projectIds; derivedProjectIds } };
    undisclosed: StatusCount;
    umbrellaProjectIds: string[];          // context only, never summed
  };
  verifiedProjectCount: StatusCount;       // included projects with ≥1 source verification === 'direct'
  regionalContext: { projectCount; projectIds; byEmirate: Record<string, StatusCount>;
                     byStatus: Partial<Record<ProjectStatus, StatusCount>>; deliveredInYear: ProjectBucket; underConstruction: ProjectBucket };
}
```

`withoutBuildingAreaIds` lists bucket members with no GFA/GLA/mixed figure,
so the UI can say "N further projects with floor area not disclosed".

`primaryUnspecified` is the "reported area, basis not stated" figure: the sum
over bucket members whose **primary** measure (`primaryAreaIndex`, else the
first measure; `primaryAreaMeasure(p)`) has basis `unspecified`, counting that
primary measure only. Secondary `unspecified` measures (e.g. a whole-campus
figure next to a storage figure) are excluded. It is shown as its own figure
and never added to GFA, GLA or mixed building area; `areas.unspecified`
(largest unspecified measure per project) is unchanged. `withoutAnyAreaIds`
lists members with no area measure at all ("area not disclosed").
Helpers: `primaryAreaMeasure(p)`, `sumPrimaryUnspecified(projects)`.

---

## 6. Status transitions (`transitions.ts`)

Ladder: `proposed → mou → term_sheet → signed_agreement → investment_committed → under_construction → construction_completed → operational`; `cancelled` is terminal.

* Same status: valid. Forward (including skips): valid. Any live status →
  `cancelled`: valid.
* Backward, or out of `cancelled`: **invalid** unless flagged as a correction
  (an event of type `correction`, usually with `statusAfter`).
* Status implied by event type (`EVENT_TYPE_IMPLIED_STATUS`): announcement →
  proposed, mou → mou, term_sheet → term_sheet, agreement_signed →
  signed_agreement, investment_committed → investment_committed,
  construction_start / construction_milestone → under_construction,
  construction_completed / **commissioned** → construction_completed, opened →
  operational, cancelled → cancelled; expansion / correction / other → none.
  `statusAfter` on an event overrides this.

---

## 7. Validation (`validate.ts`)

`validateRegister(input, options)` returns `{ ok, errors, warnings, notices }`.
Each issue is `{ code, severity, message, file?, projectId?, path? }`.
Errors fail `npm run validate` and must block pipeline commits; warnings are
for human review; notices are informational. Severity is fixed per code
(`ISSUE_CODES[code].severity`). No network checks (dead links belong to the pipeline).

| Code | Sev. | Rule |
|---|---|---|
| SCHEMA_INVALID | E | zod schema failure (path given) in any file |
| DUPLICATE_ID / DUPLICATE_EVENT_ID / DUPLICATE_RECORD_ID | E | duplicate project / event / change-or-review ids |
| PROBABLE_DUPLICATE | W | unrelated projects with name-token Jaccard ≥ 0.6, same normalised zone, compatible operator |
| SHARED_SOURCE_URL | W | same normalised source URL on two projects that are not parent/child/siblings |
| DUPLICATE_SOURCE_URL | W | same URL twice in one project's sources |
| NO_EVENTS | W | no events |
| EVENTS_NOT_SORTED | E | events not date-ascending |
| EVENT_IN_FUTURE | E | event period starts after today |
| STATUS_EVENT_MISMATCH | E | replayed event status ≠ `status` |
| STATUS_NO_SUPPORTING_EVENT | W | events exist but none implies a status |
| INVALID_TRANSITION | E | backward / out-of-cancelled move without correction |
| LATEST_MILESTONE_STALE | E | latestMilestone older than newest event |
| LATEST_MILESTONE_NOT_IN_EVENTS | W | no event with same date + URL |
| DELIVERED_WITHOUT_ACTUAL_COMPLETION | E | delivered status without `actualCompletion` |
| ACTUAL_COMPLETION_STATUS_MISMATCH | E | `actualCompletion` on a non-delivered project |
| ACTUAL_COMPLETION_IN_FUTURE | E | actual completion after today |
| FORECAST_PROMOTED_WITHOUT_SOURCE | E | actual has same date and source as the forecast |
| ACTUAL_COMPLETION_SOURCE_PREDATES | E | actual-completion source published before the completion period |
| ACTUAL_COMPLETION_NO_EVENT | W | delivered without completed/commissioned/opened event |
| FORECAST_OVERDUE | W | forecast period ended, not delivered/cancelled |
| FORECAST_UNSOURCED | W | forecast without source |
| PARENT_NOT_FOUND / PARENT_SELF / PHASE_CYCLE | E | phasing integrity |
| PHASE_AREA_EXCEEDS_PARENT | W | Σ phase area > parent area (per basis) |
| PHASE_EMIRATE_MISMATCH / PHASE_LABEL_MISSING / PHASE_LABEL_WITHOUT_PARENT | W | phasing hygiene |
| AREA_CONVERSION_MISMATCH | E | `valueM2` ≠ exact conversion (tol. max(1 m², 0.1 %)) |
| AREA_IMPLAUSIBLE | W | outside plausible range for the basis |
| AREA_UNSOURCED | E | area without `sourceUrl` |
| MULTIPLE_AREAS_SAME_BASIS | W | several measures of one basis |
| PRIMARY_AREA_INDEX_OUT_OF_RANGE | E | |
| PRIMARY_AREA_NOT_FLOOR | W | primary points at land/yard/district/unspecified |
| INVESTMENT_UNSOURCED | E | disclosed investment without source |
| AED_CONVERSION_MISMATCH | E | native_aed / usd_peg arithmetic wrong |
| GRADE_A_EVIDENCE_MISSING | E | confirmed without evidence |
| GRADE_A_PROBABLE_EVIDENCE_MISSING | W | probable without evidence |
| NET_NEW_EVIDENCE_MISSING | W | yes/no without evidence |
| URL_NOT_IN_SOURCES | W | a field-group URL not listed in `sources` |
| INVALID_URL | E | not absolute http(s) |
| REGIONAL_PROJECT | N | non-Dubai project flagged as regional context |
| ZONE_EMIRATE_MISMATCH | W | known zone in another emirate |
| ZONE_NOT_NORMALISED | W | alias spelling instead of canonical zone name |
| COMPANIES_MISSING_ROLE | W | role company missing from `companies` |
| DATE_PRECISION_NOT_NORMALISED | W | coarse-precision date not on first day of period |
| LAST_VERIFIED_IN_FUTURE / UPDATED_BEFORE_CREATED | E | |
| CHANGELOG_UNKNOWN_PROJECT / REVIEW_UNKNOWN_PROJECT | E | references to missing projects |

---

## 8. Module API (signatures)

### `schema.ts`
```ts
const SCHEMA_VERSION: 1; const AED_PER_USD: 3.6725; const NET_NEW_BASELINE_DATE: '2025-12-31';
// zod schemas (each with an inferred type of the same name minus "Schema"):
ProjectSchema, ProjectIdSchema, SourceSchema, ProjectEventSchema, AreaMeasureSchema, InvestmentSchema,
OriginalAnnouncementSchema, LatestMilestoneSchema, ForecastCompletionSchema, ActualCompletionSchema,
RegisterFileSchema, ChangeRecordSchema, ChangelogFileSchema, PendingReviewItemSchema, ReviewEvidenceSchema,
PendingReviewFileSchema, SourceScanSchema, MetaFileSchema, SourceConfigSchema, SourcesFileSchema,
IsoDateSchema, IsoDateTimeSchema, UrlStringSchema
const DATA_FILES: Record<DataFileKey, string>; type DataFileKey = 'register'|'pendingReview'|'changelog'|'meta'|'sources';
const SLUG_RE: RegExp;
function isIsoDate(s: string): boolean;
function isIsoDateTime(s: string): boolean;
function isRegional(p: Pick<Project,'emirate'>): boolean;
function isDeliveredStatus(s: ProjectStatus): boolean;
function yearOf(isoDate: string): number;
function periodStart(date: string, precision: DatePrecision): string;   // first day of period
function periodEnd(date: string, precision: DatePrecision): string;     // last day of period
function todayIso(now?: Date): string;
function labelFor(kind: keyof typeof ENUM_LABELS, value: string): string;
```

### `units.ts`
```ts
const M2_PER_UNIT: Record<AreaUnit, { num: number; den: number }>;   // exact ratios
function m2PerUnit(unit: AreaUnit): number;
function toSquareMetres(value: number, unit: AreaUnit): number;     // exact: 1e6 sqft → 92903.04
function fromSquareMetres(valueM2: number, unit: AreaUnit): number;
function roundTo(value: number, dp?: number): number;               // default 2
function conversionTolerance(exactM2: number): number;              // max(1, 0.1 %)
function conversionMatches(storedM2: number, originalValue: number, unit: AreaUnit): boolean;
```

### `normalise.ts`
```ts
interface KnownZone { name: string; label: string; emirate: Emirate; aliases: readonly string[] }
const KNOWN_ZONES: readonly KnownZone[];   // Jafza, Dubai South – Logistics District, Dubai South, Dubai Industrial City,
                                           // National Industries Park, DIP, Dubai CommerCity, Dubai Airport Freezone, ...
function normaliseZone(raw: string): string;            // alias → canonical; unknown kept (trimmed)
function findKnownZone(raw?: string): KnownZone | undefined;
function normaliseText(s: string): string;
function companyKey(name: string): string;               // comparison key, strips LLC/PJSC/Group/...
function cleanCompanyName(name: string): string;
function deriveCompanies(p: Pick<Project,'developer'|'investor'|'owner'|'operator'>, extra?: readonly string[]): string[];
function normaliseUrl(raw: string): string;              // lower host, no www/fragment/utm, no trailing slash, sorted query
function isHttpUrl(raw: string): boolean;
function nameTokens(name: string): Set<string>;
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number;
```

### `ids.ts`
```ts
function slugify(text: string, maxLength?: number): string;               // max 80
function isValidSlug(id: string): boolean;
function makeUniqueSlug(base: string, used: Iterable<string>): string;    // adds -2, -3, ...
function makeProjectId(parts: { operator?; name?; zone?; facility? }, used: Iterable<string>): string;
function collectUsedIds(input: { projects?; changelog?; pending?; retired?: string[] }): Set<string>;  // ids are never reused
function makeEventId(date: string, type: EventType, existing: Iterable<string>): string;
function makeChangeId(rec: Pick<ChangeRecord,'projectId'|'field'|'appliedAt'|'newValue'>, existing?: Iterable<string>): string;
function makeReviewId(item: Pick<PendingReviewItem,'createdAt'|'evidence'|'proposed'>, existing?: Iterable<string>): string;
function fnv1a(input: string): string;
```

### `transitions.ts`
```ts
const STATUS_LADDER: readonly ProjectStatus[];          // excludes 'cancelled'
const EVENT_TYPE_IMPLIED_STATUS: Record<EventType, ProjectStatus | undefined>;
function statusRank(s: ProjectStatus): number;          // cancelled → -1
function isValidTransition(from: ProjectStatus, to: ProjectStatus, opts?: { correction?: boolean }): boolean;
function statusFromEvent(e: Pick<ProjectEvent,'type'|'statusAfter'>): ProjectStatus | undefined;
function replayEvents(events: Pick<ProjectEvent,'id'|'type'|'statusAfter'>[]): { status: ProjectStatus | undefined; violations: { eventId; eventIndex; from; to }[] };
```

### `metrics.ts`
```ts
function computeMetrics(projects: readonly Project[], year: number): Metrics;
function isUmbrella(project: Pick<Project,'id'>, all: readonly Pick<Project,'parentId'>[]): boolean;
function umbrellaIdSet(all): Set<string>;
function countableProjects<T>(all: readonly T[]): T[];  // excludes umbrellas
function phasesOf<T>(parentId: string, all: readonly T[]): T[];
function isDeliveredInYear(p: Pick<Project,'status'|'actualCompletion'>, year: number): boolean;
function selectAreasByBasis(p): Partial<Record<AreaBasis, { valueM2: number; index: number }>>;
function sumAreasByBasis(projects): AreaBreakdown;
function emptyAreaBreakdown(): AreaBreakdown;
function hasBuildingArea(p: Pick<Project,'areas'>): boolean;
```

### `presentation.ts`
```ts
interface PresentedTotals {
  year: number;
  openings: { rows: Project[]; openedCount: number; completedOnlyCount: number; statusCompletedOnlyCount: number;
              disclosedFloorCount: number; floorAreaM2: number };
  beingBuilt: { rows: Project[]; floorAreaM2: number };
  signedOrAnnounced: { rows: Project[] };
  notCounted: { rows: Project[] };
  addedAfterPdf: { rows: Project[] };
}
function computePresentedTotals(projects: readonly Project[], year: number): PresentedTotals;
function presentedRows(projects: readonly Project[], section: PresentationSection): Project[];  // sorted by sortOrder, then id
function isCountedPresentedArea(p: Project): boolean;   // countedInPresentedTotal && presentedAreaM2 present
function sumPresentedArea(rows: readonly Project[]): number;
```
Rows are sorted by `sortOrder`. `floorAreaM2` = Σ `presentedAreaM2` where
`countedInPresentedTotal` ("as reported", mixed bases). `openedCount` =
openings rows minus `completedOnlyCount` (rows with `presentedMilestone:
'completed_only'`); `statusCompletedOnlyCount` = openings rows whose `status`
is `construction_completed`. `disclosedFloorCount` = openings rows with a
counted figure.

### `validate.ts`
```ts
function validateRegister(input: { register: unknown; changelog?: unknown; pendingReview?: unknown; meta?: unknown; sources?: unknown },
                          options?: { today?: string }): ValidationResult;
function validateProjects(projects: readonly Project[], options?: { today?: string }): ValidationResult;  // semantic checks only
function formatIssue(i: ValidationIssue): string;
const ISSUE_CODES: Record<IssueCode, { severity: Severity; description: string }>;
const DUPLICATE_NAME_SIMILARITY: 0.6;
type ValidationResult = { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; notices: ValidationIssue[] };
```

### `exports.ts`
```ts
function serializeDataFile(data: unknown): string;               // canonical bytes for data/*.json
function registerToJson(projects: readonly Project[], updatedAt?: string): string;
function registerToCsv(projects: readonly Project[], options?: { bom?: boolean; allProjects?: readonly Project[] }): string;
function csvCell(v: string | number | boolean | null | undefined): string;   // RFC 4180 + formula-injection guard
const CSV_COLUMNS: readonly string[];
```
CSV: one row per project, CRLF, one column per area basis (never summed),
lists joined with `; `, `is_umbrella` and `regional_context` flags.

### Site helpers (`src/lib/loadData.ts`, browser only)
```ts
function dataUrl(key: DataFileKey): string;   // './data/register.json'
function loadSiteData(signal?: AbortSignal): Promise<{ register; meta; changelog; pendingReview }>;  // fetch + zod parse
```

### Node helpers (`scripts/data-files.ts`, Node only)
```ts
const REPO_ROOT: string;
function dataPath(key: DataFileKey, root?: string): string;
function readDataFile(key: DataFileKey, root?: string): Promise<unknown>;
function readAllDataFiles(root?: string): Promise<Record<DataFileKey, unknown>>;
```

---

## 9. Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite (sync-data runs first; `base: './'`; build runs typecheck first) |
| `npm test` | vitest (shared + scripts tests) |
| `npm run typecheck` | `tsc` for app (DOM) and node configs |
| `npm run lint` | ESLint; `shared/` may not import Node built-ins or use DOM/Node globals |
| `npm run validate` | all checks on `data/`; exit 1 on errors. Flags: `--quiet`, `--json`, `--today=YYYY-MM-DD` |
| `npm run sync-data` | copy `data/*.json` → `public/data/` |

Test fixtures (fictional, `example.com` URLs) live in
`shared/__fixtures__/projects.ts` (`FIXTURE_PROJECTS`, `FIXTURE_TODAY`,
`fixture()` builder). Never copy them into `data/`.
