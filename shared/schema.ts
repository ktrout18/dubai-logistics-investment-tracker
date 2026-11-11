/**
 * Canonical data model for the Dubai Logistics Investment Tracker.
 *
 * Pure TypeScript + zod: no Node-only or DOM-only APIs, so this module is safe
 * to import from the site (browser) and the ingestion pipeline (Node).
 *
 * Conventions
 * - Every enum is exported as a `const` tuple (e.g. `SECTORS`), an inferred
 *   union type (e.g. `Sector`) and a human label map (e.g. `SECTOR_LABELS`).
 * - Dates are ISO calendar dates `YYYY-MM-DD`. When only a month / quarter /
 *   year is known, the date is set to the FIRST day of that period and
 *   `datePrecision` records how much of the date is meaningful.
 * - Timestamps (`createdAt`, `appliedAt`, ...) are ISO 8601 date-times in UTC.
 * - URLs are stored as plain strings here; syntax is checked by
 *   `validateRegister` (code `INVALID_URL`) so that errors carry precise paths.
 */
import { z } from 'zod';

/** Bump when a breaking change is made to any data file shape. */
export const SCHEMA_VERSION = 1 as const;

/** USD→AED peg used for derived AED conversions (Central Bank of the UAE). */
export const AED_PER_USD = 3.6725 as const;

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `s` is a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(s: string): boolean {
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** True when `s` is an ISO 8601 date-time with an explicit offset (`Z` or `±hh:mm`). */
export function isIsoDateTime(s: string): boolean {
  return ISO_DATETIME_RE.test(s) && isIsoDate(s.slice(0, 10)) && !Number.isNaN(Date.parse(s));
}

export const IsoDateSchema = z.string().refine(isIsoDate, { message: 'Expected a calendar date YYYY-MM-DD' });
export const IsoDateTimeSchema = z
  .string()
  .refine(isIsoDateTime, { message: 'Expected an ISO 8601 date-time with offset, e.g. 2026-01-31T06:00:00Z' });
/** URL string. Syntax (http/https, parseable) is checked by the validator, code INVALID_URL. */
export const UrlStringSchema = z.string().min(1, 'URL must not be empty');
const NonEmpty = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Enums (const tuple + type + labels)
// ---------------------------------------------------------------------------

export const EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Fujairah',
  'Ajman',
  'Ras Al Khaimah',
  'Umm Al Quwain',
  'Other',
] as const;
export type Emirate = (typeof EMIRATES)[number];
export const EMIRATE_LABELS: Record<Emirate, string> = {
  Dubai: 'Dubai',
  'Abu Dhabi': 'Abu Dhabi',
  Sharjah: 'Sharjah',
  Fujairah: 'Fujairah',
  Ajman: 'Ajman',
  'Ras Al Khaimah': 'Ras Al Khaimah',
  'Umm Al Quwain': 'Umm Al Quwain',
  Other: 'Other / outside UAE',
};

export const SECTORS = [
  'grade_a_warehousing',
  'modern_warehousing',
  'automotive_spare_parts',
  'finished_vehicles',
  'industrial_machinery',
  'chemicals_dangerous_goods',
  'fashion_luxury_ecommerce',
  'food_fmcg_cold_chain',
  'aerospace_air_cargo',
  'multimodal_container_inland',
  'other',
] as const;
export type Sector = (typeof SECTORS)[number];
export const SECTOR_LABELS: Record<Sector, string> = {
  grade_a_warehousing: 'Grade-A warehousing',
  modern_warehousing: 'Modern warehousing',
  automotive_spare_parts: 'Automotive spare parts',
  finished_vehicles: 'Finished vehicles',
  industrial_machinery: 'Industrial machinery',
  chemicals_dangerous_goods: 'Chemicals & dangerous goods',
  fashion_luxury_ecommerce: 'Fashion, luxury & e-commerce',
  food_fmcg_cold_chain: 'Food, FMCG & cold chain',
  aerospace_air_cargo: 'Aerospace & air cargo',
  multimodal_container_inland: 'Multimodal, container & inland',
  other: 'Other',
};

export const ASSET_TYPES = [
  'warehouse',
  'distribution_centre',
  'fulfilment_centre',
  'cold_store',
  'logistics_park',
  'vehicle_processing_centre',
  'dangerous_goods_store',
  'air_cargo_terminal',
  'mro_aerospace_facility',
  'container_terminal_or_depot',
  'inland_port_or_rail',
  'open_yard',
  'mixed_industrial',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  warehouse: 'Warehouse',
  distribution_centre: 'Distribution centre',
  fulfilment_centre: 'Fulfilment centre',
  cold_store: 'Cold store',
  logistics_park: 'Logistics park',
  vehicle_processing_centre: 'Vehicle processing centre',
  dangerous_goods_store: 'Dangerous goods store',
  air_cargo_terminal: 'Air cargo terminal',
  mro_aerospace_facility: 'MRO / aerospace facility',
  container_terminal_or_depot: 'Container terminal or depot',
  inland_port_or_rail: 'Inland port or rail',
  open_yard: 'Open yard',
  mixed_industrial: 'Mixed industrial',
  other: 'Other',
};

/** Project status. Order here IS the status ladder used by `transitions.ts` (cancelled is terminal, off-ladder). */
export const PROJECT_STATUSES = [
  'proposed',
  'mou',
  'term_sheet',
  'signed_agreement',
  'investment_committed',
  'under_construction',
  'construction_completed',
  'operational',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  proposed: 'Proposed',
  mou: 'MoU signed',
  term_sheet: 'Term sheet',
  signed_agreement: 'Signed agreement',
  investment_committed: 'Investment committed',
  under_construction: 'Under construction',
  construction_completed: 'Construction completed',
  operational: 'Operational',
  cancelled: 'Cancelled',
};
/** Statuses that count as "delivered" (subject to a sourced actual completion date). */
export const DELIVERED_STATUSES = ['construction_completed', 'operational'] as const satisfies readonly ProjectStatus[];
/** Statuses reported as committed but not yet started. */
export const COMMITTED_NOT_STARTED_STATUSES = [
  'signed_agreement',
  'investment_committed',
] as const satisfies readonly ProjectStatus[];
/** Non-binding pipeline statuses. */
export const NON_BINDING_STATUSES = ['proposed', 'mou', 'term_sheet'] as const satisfies readonly ProjectStatus[];

export const DATE_PRECISIONS = ['day', 'month', 'quarter', 'year'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
export const DATE_PRECISION_LABELS: Record<DatePrecision, string> = {
  day: 'Exact day',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

export const AREA_BASES = [
  'warehouse_gfa',
  'gla',
  'mixed_building_area',
  'site_land_area',
  'open_yard',
  'district_area',
  'unspecified',
] as const;
export type AreaBasis = (typeof AREA_BASES)[number];
export const AREA_BASIS_LABELS: Record<AreaBasis, string> = {
  warehouse_gfa: 'Warehouse gross floor area (GFA)',
  gla: 'Gross leasable area (GLA)',
  mixed_building_area: 'Mixed building area (warehouse + office/other, not separable)',
  site_land_area: 'Site / land plot area',
  open_yard: 'Open yard area',
  district_area: 'District / masterplan area',
  unspecified: 'Area basis not specified by source',
};
/** The only bases that may enter "warehouse floor area" metrics (each reported separately). */
export const WAREHOUSE_FLOOR_BASES = ['warehouse_gfa', 'gla'] as const satisfies readonly AreaBasis[];
/** Building area that is not purely warehouse; reported separately and labelled as such. */
export const MIXED_BUILDING_BASES = ['mixed_building_area'] as const satisfies readonly AreaBasis[];
/** Bases that never enter floor-space metrics. */
export const NON_FLOOR_BASES = [
  'site_land_area',
  'open_yard',
  'district_area',
  'unspecified',
] as const satisfies readonly AreaBasis[];

export const AREA_UNITS = ['sqm', 'sqft', 'hectare', 'acre'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];
export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqm: 'square metres (m²)',
  sqft: 'square feet (sq ft)',
  hectare: 'hectares (ha)',
  acre: 'acres',
};

export const GRADE_A_STATUSES = ['confirmed', 'probable', 'unverified', 'not_applicable'] as const;
export type GradeAStatus = (typeof GRADE_A_STATUSES)[number];
export const GRADE_A_LABELS: Record<GradeAStatus, string> = {
  confirmed: 'Grade-A confirmed',
  probable: 'Grade-A probable',
  unverified: 'Grade not verified',
  not_applicable: 'Not applicable',
};

export const NET_NEW_VALUES = ['yes', 'no', 'unknown'] as const;
export type NetNew = (typeof NET_NEW_VALUES)[number];
export const NET_NEW_LABELS: Record<NetNew, string> = {
  yes: 'Net new (after 31 Dec 2025)',
  no: 'Not net new',
  unknown: 'Unknown',
};
/** `netNew` is assessed relative to this baseline date. */
export const NET_NEW_BASELINE_DATE = '2025-12-31' as const;

export const SOURCE_TYPES = ['primary', 'secondary'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  primary: 'Primary (official / company / government)',
  secondary: 'Secondary (media / third party)',
};

export const VERIFICATION_LEVELS = ['direct', 'indexed', 'inferred'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];
export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  direct: 'Read directly at source',
  indexed: 'Seen via search index / snippet only',
  inferred: 'Inferred from other evidence',
};

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const EVENT_TYPES = [
  'announcement',
  'mou',
  'term_sheet',
  'agreement_signed',
  'investment_committed',
  'construction_start',
  'construction_milestone',
  'construction_completed',
  'commissioned',
  'opened',
  'expansion',
  'cancelled',
  'correction',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  announcement: 'Announcement',
  mou: 'MoU signed',
  term_sheet: 'Term sheet',
  agreement_signed: 'Agreement signed',
  investment_committed: 'Investment committed',
  construction_start: 'Construction started',
  construction_milestone: 'Construction milestone',
  construction_completed: 'Construction completed',
  commissioned: 'Commissioned',
  opened: 'Opened',
  expansion: 'Expansion',
  cancelled: 'Cancelled',
  correction: 'Correction',
  other: 'Other',
};
/** Event types counted as "investment announcements" by `computeMetrics`. */
export const INVESTMENT_ANNOUNCEMENT_EVENT_TYPES = [
  'announcement',
  'mou',
  'term_sheet',
  'agreement_signed',
  'investment_committed',
] as const satisfies readonly EventType[];

export const PROVENANCES = ['seed_pdf', 'manual', 'pipeline'] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const PROVENANCE_LABELS: Record<Provenance, string> = {
  seed_pdf: 'Seed PDF (owner research)',
  manual: 'Manual entry',
  pipeline: 'Automated pipeline',
};

export const AED_DERIVATIONS = ['stated_in_source', 'native_aed', 'usd_peg'] as const;
export type AedDerivation = (typeof AED_DERIVATIONS)[number];
export const AED_DERIVATION_LABELS: Record<AedDerivation, string> = {
  stated_in_source: 'AED figure stated by the source',
  native_aed: 'Amount disclosed in AED',
  usd_peg: `Derived from USD at the ${AED_PER_USD} peg`,
};

export const CHANGE_VERIFICATION_STATUSES = [
  'verified_official',
  'verified_multiple',
  'indexed_only',
  'unverified',
] as const;
export type ChangeVerificationStatus = (typeof CHANGE_VERIFICATION_STATUSES)[number];
export const CHANGE_VERIFICATION_LABELS: Record<ChangeVerificationStatus, string> = {
  verified_official: 'Verified (official source)',
  verified_multiple: 'Verified (multiple independent sources)',
  indexed_only: 'Search index only',
  unverified: 'Unverified',
};

export const APPLIED_BY_VALUES = ['pipeline', 'manual'] as const;
export type AppliedBy = (typeof APPLIED_BY_VALUES)[number];
export const APPLIED_BY_LABELS: Record<AppliedBy, string> = { pipeline: 'Pipeline', manual: 'Manual' };

export const REVIEW_KINDS = ['new_project', 'update', 'conflict'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  new_project: 'New project',
  update: 'Update to existing project',
  conflict: 'Conflicting evidence',
};

export const REVIEW_STATES = ['open', 'accepted', 'rejected'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  open: 'Open',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export const RUN_STATUSES = ['never_run', 'success', 'partial', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  never_run: 'Not yet run',
  success: 'Succeeded',
  partial: 'Partially succeeded',
  failed: 'Failed',
};

export const SCAN_STATUSES = ['ok', 'fallback_used', 'failed', 'skipped'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];
export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  ok: 'OK',
  fallback_used: 'Fallback used',
  failed: 'Failed',
  skipped: 'Skipped',
};

/** Index of every enum's label map, keyed by enum name, for generic UI rendering. */
export const ENUM_LABELS = {
  emirate: EMIRATE_LABELS,
  sector: SECTOR_LABELS,
  assetType: ASSET_TYPE_LABELS,
  status: PROJECT_STATUS_LABELS,
  datePrecision: DATE_PRECISION_LABELS,
  areaBasis: AREA_BASIS_LABELS,
  areaUnit: AREA_UNIT_LABELS,
  gradeA: GRADE_A_LABELS,
  netNew: NET_NEW_LABELS,
  sourceType: SOURCE_TYPE_LABELS,
  verification: VERIFICATION_LABELS,
  confidence: CONFIDENCE_LABELS,
  eventType: EVENT_TYPE_LABELS,
  provenance: PROVENANCE_LABELS,
  aedDerivation: AED_DERIVATION_LABELS,
  changeVerification: CHANGE_VERIFICATION_LABELS,
  appliedBy: APPLIED_BY_LABELS,
  reviewKind: REVIEW_KIND_LABELS,
  reviewState: REVIEW_STATE_LABELS,
  runStatus: RUN_STATUS_LABELS,
  scanStatus: SCAN_STATUS_LABELS,
} as const;

// ---------------------------------------------------------------------------
// Project sub-schemas
// ---------------------------------------------------------------------------

export const DatedSourcedSchema = z
  .object({
    date: IsoDateSchema,
    datePrecision: z.enum(DATE_PRECISIONS),
    sourceUrl: UrlStringSchema,
    sourceTitle: z.string().optional(),
  })
  .strict();
export type OriginalAnnouncement = z.infer<typeof DatedSourcedSchema>;
export const OriginalAnnouncementSchema = DatedSourcedSchema;

export const LatestMilestoneSchema = z
  .object({
    date: IsoDateSchema,
    datePrecision: z.enum(DATE_PRECISIONS),
    description: NonEmpty,
    sourceUrl: UrlStringSchema,
  })
  .strict();
export type LatestMilestone = z.infer<typeof LatestMilestoneSchema>;

export const InvestmentSchema = z
  .object({
    /** Amount in `currency` units (not millions). Required when `disclosed` is true. */
    amount: z.number().positive().optional(),
    /** ISO 4217 code, e.g. "AED", "USD", "EUR". Required when `disclosed` is true. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'ISO 4217 currency code expected')
      .optional(),
    /** AED value: only when the source states it, the currency is AED, or USD via the 3.6725 peg. */
    amountAed: z.number().positive().optional(),
    /** How `amountAed` was obtained. Required whenever `amountAed` is present. */
    amountAedDerivation: z.enum(AED_DERIVATIONS).optional(),
    /** Free-text note on what the amount covers (e.g. "total programme capex incl. phase 2"). */
    basis: z.string(),
    /** False when the investment exists but its value was not disclosed. */
    disclosed: z.boolean(),
    sourceUrl: UrlStringSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.disclosed && (v.amount === undefined || v.currency === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Disclosed investment requires amount and currency' });
    }
    if (!v.disclosed && (v.amount !== undefined || v.amountAed !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Undisclosed investment must not carry an amount' });
    }
    if (v.amountAed !== undefined && v.amountAedDerivation === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amountAed requires amountAedDerivation (never invent an AED conversion)',
        path: ['amountAedDerivation'],
      });
    }
    if (v.amountAedDerivation === 'usd_peg' && v.currency !== 'USD') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'usd_peg derivation requires currency USD' });
    }
    if (v.amountAedDerivation === 'native_aed' && v.currency !== 'AED') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'native_aed derivation requires currency AED' });
    }
  });
export type Investment = z.infer<typeof InvestmentSchema>;

export const AreaMeasureSchema = z
  .object({
    /** Area in square metres (converted exactly from `originalValue`/`originalUnit` when given). */
    valueM2: z.number().positive(),
    basis: z.enum(AREA_BASES),
    label: z.string().optional(),
    /** The figure exactly as the source gave it. */
    originalValue: z.number().positive().optional(),
    originalUnit: z.enum(AREA_UNITS).optional(),
    sourceUrl: UrlStringSchema.optional(),
    note: z.string().optional(),
  })
  .strict()
  .refine((a) => (a.originalValue === undefined) === (a.originalUnit === undefined), {
    message: 'originalValue and originalUnit must be given together',
  });
export type AreaMeasure = z.infer<typeof AreaMeasureSchema>;

export const ForecastCompletionSchema = z
  .object({
    date: IsoDateSchema,
    datePrecision: z.enum(DATE_PRECISIONS),
    sourceUrl: UrlStringSchema.optional(),
  })
  .strict();
export type ForecastCompletion = z.infer<typeof ForecastCompletionSchema>;

export const ActualCompletionSchema = z
  .object({
    date: IsoDateSchema,
    datePrecision: z.enum(DATE_PRECISIONS),
    /** Required: an actual completion date must be evidenced. */
    sourceUrl: UrlStringSchema,
  })
  .strict();
export type ActualCompletion = z.infer<typeof ActualCompletionSchema>;

export const SourceSchema = z
  .object({
    url: UrlStringSchema,
    title: z.string().optional(),
    publisher: z.string().optional(),
    publishedDate: IsoDateSchema.optional(),
    type: z.enum(SOURCE_TYPES),
    accessedDate: IsoDateSchema.optional(),
    verification: z.enum(VERIFICATION_LEVELS),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const ProjectEventSchema = z
  .object({
    /** Unique within the project. See `makeEventId` in ids.ts. */
    id: NonEmpty,
    date: IsoDateSchema,
    datePrecision: z.enum(DATE_PRECISIONS),
    type: z.enum(EVENT_TYPES),
    /** Explicit status after this event; overrides the type's implied status (see transitions.ts). */
    statusAfter: z.enum(PROJECT_STATUSES).optional(),
    summary: NonEmpty,
    sourceUrl: UrlStringSchema,
    sourcePublishedDate: IsoDateSchema.optional(),
    sourceType: z.enum(SOURCE_TYPES),
    verification: z.enum(VERIFICATION_LEVELS),
  })
  .strict();
export type ProjectEvent = z.infer<typeof ProjectEventSchema>;

/** Slug: lowercase a-z, 0-9 and single hyphens; 3–100 chars. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ProjectIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(SLUG_RE, 'id must be a lowercase hyphenated slug');

export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    name: NonEmpty,
    facilityName: z.string().optional(),
    summary: NonEmpty,

    developer: z.string().optional(),
    investor: z.string().optional(),
    owner: z.string().optional(),
    operator: z.string().optional(),
    /** Normalised, de-duplicated company names for filtering (see `deriveCompanies`). */
    companies: z.array(NonEmpty),

    emirate: z.enum(EMIRATES),
    location: NonEmpty,
    /** Industrial zone. Free string; use `normaliseZone` to map aliases to KNOWN_ZONES names. */
    zone: z.string().optional(),

    sectors: z.array(z.enum(SECTORS)).min(1),
    assetType: z.enum(ASSET_TYPES),
    status: z.enum(PROJECT_STATUSES),

    originalAnnouncement: OriginalAnnouncementSchema.optional(),
    latestMilestone: LatestMilestoneSchema,
    investment: InvestmentSchema.optional(),

    areas: z.array(AreaMeasureSchema),
    /** Index into `areas` of the measure representing the facility's floor space. */
    primaryAreaIndex: z.number().int().nonnegative().optional(),

    gradeA: z.enum(GRADE_A_STATUSES),
    gradeAEvidence: z.string().optional(),
    netNew: z.enum(NET_NEW_VALUES),
    netNewEvidence: z.string().optional(),

    forecastCompletion: ForecastCompletionSchema.optional(),
    actualCompletion: ActualCompletionSchema.optional(),

    sources: z.array(SourceSchema).min(1),
    lastVerified: IsoDateSchema,
    confidence: z.enum(CONFIDENCE_LEVELS),
    unresolvedQuestions: z.array(z.string()),

    events: z.array(ProjectEventSchema),

    parentId: ProjectIdSchema.optional(),
    phaseLabel: z.string().optional(),

    provenance: z.enum(PROVENANCES),
    seedNote: z.string().optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// Data files
// ---------------------------------------------------------------------------

/** data/register.json */
export const RegisterFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    updatedAt: IsoDateTimeSchema.optional(),
    projects: z.array(ProjectSchema),
  })
  .strict();
export type RegisterFile = z.infer<typeof RegisterFileSchema>;

/** One entry in data/changelog.json */
export const ChangeRecordSchema = z
  .object({
    id: NonEmpty,
    projectId: ProjectIdSchema,
    runId: z.string().optional(),
    /** Dotted/bracketed path of the changed field, e.g. "status", "areas[0].valueM2", "events" . */
    field: NonEmpty,
    /** JSON value before the change (null when the field was absent / project was new). */
    previousValue: z.unknown(),
    newValue: z.unknown(),
    evidenceUrl: UrlStringSchema,
    evidenceDate: IsoDateSchema,
    reason: NonEmpty,
    verificationStatus: z.enum(CHANGE_VERIFICATION_STATUSES),
    appliedAt: IsoDateTimeSchema,
    appliedBy: z.enum(APPLIED_BY_VALUES),
  })
  .strict();
export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

/** data/changelog.json */
export const ChangelogFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    changes: z.array(ChangeRecordSchema),
  })
  .strict();
export type ChangelogFile = z.infer<typeof ChangelogFileSchema>;

export const ReviewEvidenceSchema = z
  .object({
    url: UrlStringSchema,
    publishedDate: IsoDateSchema.optional(),
    quote: z.string().optional(),
  })
  .strict();
export type ReviewEvidence = z.infer<typeof ReviewEvidenceSchema>;

/** One entry in data/pending-review.json */
export const PendingReviewItemSchema = z
  .object({
    id: NonEmpty,
    createdAt: IsoDateTimeSchema,
    runId: z.string().optional(),
    kind: z.enum(REVIEW_KINDS),
    /** Required for `update` and `conflict`; absent for `new_project`. */
    projectId: ProjectIdSchema.optional(),
    /** Partial project (new_project) or map of field path → proposed value (update/conflict). Not schema-checked. */
    proposed: z.record(z.unknown()),
    evidence: z.array(ReviewEvidenceSchema).min(1),
    reasonHeld: NonEmpty,
    issueUrl: UrlStringSchema.optional(),
    state: z.enum(REVIEW_STATES),
    resolvedAt: IsoDateTimeSchema.optional(),
    resolutionNote: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind !== 'new_project' && !v.projectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.kind} items require projectId`, path: ['projectId'] });
    }
    if (v.state !== 'open' && !v.resolvedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resolved items require resolvedAt', path: ['resolvedAt'] });
    }
  });
export type PendingReviewItem = z.infer<typeof PendingReviewItemSchema>;

/** data/pending-review.json */
export const PendingReviewFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    items: z.array(PendingReviewItemSchema),
  })
  .strict();
export type PendingReviewFile = z.infer<typeof PendingReviewFileSchema>;

export const SourceScanSchema = z
  .object({
    sourceId: NonEmpty,
    name: NonEmpty,
    lastAttempt: IsoDateTimeSchema,
    lastSuccess: IsoDateTimeSchema.optional(),
    status: z.enum(SCAN_STATUSES),
    /** e.g. "rss", "html", "search-api", "fallback:search-index". */
    method: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type SourceScan = z.infer<typeof SourceScanSchema>;

/** data/meta.json */
export const MetaFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    lastSuccessfulRun: IsoDateTimeSchema.optional(),
    lastAttemptedRun: IsoDateTimeSchema.optional(),
    lastRunStatus: z.enum(RUN_STATUSES),
    sourceScans: z.array(SourceScanSchema),
    coverageLimitations: z.array(z.string()),
    /** The dataset must never claim completeness. */
    exhaustive: z.literal(false),
  })
  .strict();
export type MetaFile = z.infer<typeof MetaFileSchema>;

/**
 * data/sources.json — owned by the pipeline worker. Only the envelope and the
 * `id`/`name` of each entry are fixed here; extra keys pass through untouched.
 */
export const SourceConfigSchema = z.object({ id: NonEmpty, name: NonEmpty }).passthrough();
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export const SourcesFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sources: z.array(SourceConfigSchema),
  })
  .passthrough();
export type SourcesFile = z.infer<typeof SourcesFileSchema>;

/** Paths of the canonical files relative to the repo root (and to the site root under `./`). */
export const DATA_FILES = {
  register: 'data/register.json',
  pendingReview: 'data/pending-review.json',
  changelog: 'data/changelog.json',
  meta: 'data/meta.json',
  sources: 'data/sources.json',
} as const;
export type DataFileKey = keyof typeof DATA_FILES;

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Derived flag: a project outside Dubai. Regional projects never enter Dubai totals. */
export function isRegional(p: Pick<Project, 'emirate'>): boolean {
  return p.emirate !== 'Dubai';
}

/** Year (number) of an ISO date. */
export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

/** True when `status` is construction_completed or operational. */
export function isDeliveredStatus(status: ProjectStatus): boolean {
  return (DELIVERED_STATUSES as readonly ProjectStatus[]).includes(status);
}

/** Human label for any enum value; falls back to the raw value. */
export function labelFor<K extends keyof typeof ENUM_LABELS>(kind: K, value: string): string {
  const map = ENUM_LABELS[kind] as Record<string, string>;
  return map[value] ?? value;
}

/** First calendar day of the period a (date, precision) pair denotes, e.g. ('2026-05-17','quarter') → '2026-04-01'. */
export function periodStart(date: string, precision: DatePrecision): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  switch (precision) {
    case 'day':
      return date;
    case 'month':
      return `${y}-${String(m).padStart(2, '0')}-01`;
    case 'quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return `${y}-${String(qm).padStart(2, '0')}-01`;
    }
    case 'year':
      return `${y}-01-01`;
  }
}

/**
 * The last calendar day of the period a (date, precision) pair denotes, e.g.
 * ('2026-04-01','quarter') → '2026-06-30'.
 */
export function periodEnd(date: string, precision: DatePrecision): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const fmt = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  switch (precision) {
    case 'day':
      return date;
    case 'month':
      return fmt(y, m, lastDay(y, m));
    case 'quarter': {
      const qEnd = Math.floor((m - 1) / 3) * 3 + 3;
      return fmt(y, qEnd, lastDay(y, qEnd));
    }
    case 'year':
      return fmt(y, 12, 31);
  }
}

/** Today's date in UTC as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
