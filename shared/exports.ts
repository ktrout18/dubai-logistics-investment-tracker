/**
 * Register exports: CSV (one row per project) and canonical JSON.
 *
 * The JSON export IS the canonical file: `serializeDataFile` produces exactly
 * the bytes written to data/*.json (2-space indent, trailing newline), so the
 * site can offer `./data/register.json` as the download.
 */
import type { AreaBasis, Project, RegisterFile } from './schema.ts';
import {
  AREA_BASES,
  PROJECT_STATUS_LABELS,
  SCHEMA_VERSION,
  isRegional,
} from './schema.ts';
import { selectAreasByBasis, umbrellaIdSet } from './metrics.ts';

/** Stable, pretty JSON for any data file (2-space indent + trailing newline). */
export function serializeDataFile(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Wrap projects in the register envelope and serialise. */
export function registerToJson(projects: readonly Project[], updatedAt?: string): string {
  const file: RegisterFile = { schemaVersion: SCHEMA_VERSION, ...(updatedAt ? { updatedAt } : {}), projects: [...projects] };
  return serializeDataFile(file);
}

const AREA_COLUMN: Record<AreaBasis, string> = {
  warehouse_gfa: 'area_warehouse_gfa_m2',
  gla: 'area_gla_m2',
  mixed_building_area: 'area_mixed_building_m2',
  site_land_area: 'area_site_land_m2',
  open_yard: 'area_open_yard_m2',
  district_area: 'area_district_m2',
  unspecified: 'area_unspecified_m2',
};

type Cell = string | number | boolean | undefined | null;
type ColumnDef = readonly [header: string, get: (p: Project, ctx: { umbrellas: ReadonlySet<string> }) => Cell];

const COLUMNS: readonly ColumnDef[] = [
  ['id', (p) => p.id],
  ['name', (p) => p.name],
  ['facility_name', (p) => p.facilityName],
  ['status', (p) => p.status],
  ['status_label', (p) => PROJECT_STATUS_LABELS[p.status]],
  ['emirate', (p) => p.emirate],
  ['regional_context', (p) => isRegional(p)],
  ['zone', (p) => p.zone],
  ['location', (p) => p.location],
  ['sectors', (p) => p.sectors.join('; ')],
  ['asset_type', (p) => p.assetType],
  ['developer', (p) => p.developer],
  ['investor', (p) => p.investor],
  ['owner', (p) => p.owner],
  ['operator', (p) => p.operator],
  ['companies', (p) => p.companies.join('; ')],
  ['parent_id', (p) => p.parentId],
  ['phase_label', (p) => p.phaseLabel],
  ['is_umbrella', (p, ctx) => ctx.umbrellas.has(p.id)],
  ['grade_a', (p) => p.gradeA],
  ['grade_a_evidence', (p) => p.gradeAEvidence],
  ['net_new', (p) => p.netNew],
  ...AREA_BASES.map(
    (b): ColumnDef => [AREA_COLUMN[b], (p) => selectAreasByBasis(p)[b]?.valueM2],
  ),
  ['primary_area_basis', (p) => (p.primaryAreaIndex !== undefined ? p.areas[p.primaryAreaIndex]?.basis : undefined)],
  ['investment_disclosed', (p) => p.investment?.disclosed],
  ['investment_amount', (p) => p.investment?.amount],
  ['investment_currency', (p) => p.investment?.currency],
  ['investment_amount_aed', (p) => p.investment?.amountAed],
  ['investment_aed_derivation', (p) => p.investment?.amountAedDerivation],
  ['investment_basis', (p) => p.investment?.basis],
  ['investment_source_url', (p) => p.investment?.sourceUrl],
  ['original_announcement_date', (p) => p.originalAnnouncement?.date],
  ['original_announcement_precision', (p) => p.originalAnnouncement?.datePrecision],
  ['original_announcement_source_url', (p) => p.originalAnnouncement?.sourceUrl],
  ['latest_milestone_date', (p) => p.latestMilestone.date],
  ['latest_milestone_precision', (p) => p.latestMilestone.datePrecision],
  ['latest_milestone', (p) => p.latestMilestone.description],
  ['latest_milestone_source_url', (p) => p.latestMilestone.sourceUrl],
  ['forecast_completion_date', (p) => p.forecastCompletion?.date],
  ['forecast_completion_precision', (p) => p.forecastCompletion?.datePrecision],
  ['actual_completion_date', (p) => p.actualCompletion?.date],
  ['actual_completion_precision', (p) => p.actualCompletion?.datePrecision],
  ['actual_completion_source_url', (p) => p.actualCompletion?.sourceUrl],
  ['confidence', (p) => p.confidence],
  ['last_verified', (p) => p.lastVerified],
  ['source_count', (p) => p.sources.length],
  ['source_urls', (p) => p.sources.map((s) => s.url).join(' ')],
  ['unresolved_questions', (p) => p.unresolvedQuestions.join(' | ')],
  ['provenance', (p) => p.provenance],
  ['seed_note', (p) => p.seedNote],
  ['updated_at', (p) => p.updatedAt],
];

/** CSV header names, in column order. */
export const CSV_COLUMNS: readonly string[] = COLUMNS.map(([h]) => h);

/**
 * Escape one CSV cell (RFC 4180). Text cells that a spreadsheet would treat
 * as a formula (leading `=`, `+`, `-`, `@`, tab or CR) are prefixed with `'`
 * to prevent CSV formula injection; numbers are written as-is.
 */
export function csvCell(v: Cell): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvOptions {
  /** Prepend a UTF-8 BOM so Excel detects the encoding. Default false. */
  bom?: boolean;
  /**
   * All projects in the register, used to mark umbrellas when `projects` is a
   * filtered subset. Defaults to `projects`.
   */
  allProjects?: readonly Project[];
}

/**
 * One row per project, CRLF line endings, header row first. Areas appear as
 * one column per basis (never summed across bases); lists are `; `-joined.
 */
export function registerToCsv(projects: readonly Project[], options: CsvOptions = {}): string {
  const ctx = { umbrellas: umbrellaIdSet(options.allProjects ?? projects) };
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const p of projects) lines.push(COLUMNS.map(([, get]) => csvCell(get(p, ctx))).join(','));
  return `${options.bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`;
}
