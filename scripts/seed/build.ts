/**
 * Regenerate data/register.json and data/pending-review.json from the curated
 * seed in scripts/seed/. Run: `npx tsx scripts/seed/build.ts` (add --check to
 * validate without writing). Exits 1 if the seed has validation errors.
 *
 * Note: this overwrites both files. Run it only to (re)create the seed, never
 * after the pipeline has started adding records.
 */
import { writeFile } from 'node:fs/promises';
import {
  computeBriefing,
  computeMetrics,
  formatIssue,
  subtotalsText,
  PendingReviewFileSchema,
  RegisterFileSchema,
  registerToJson,
  serializeDataFile,
  SCHEMA_VERSION,
  validateRegister,
} from '../../shared/index.ts';
import { dataPath } from '../data-files.ts';
import { AUDIT_DATE, SEED_TS } from './lib.ts';
import { buildPendingItems } from './pending.ts';
import { SEED_PROJECTS } from './projects.ts';

const check = process.argv.includes('--check');

async function main(): Promise<number> {
  const register = JSON.parse(registerToJson(SEED_PROJECTS, SEED_TS)) as unknown;
  const pendingReview = { schemaVersion: SCHEMA_VERSION, items: buildPendingItems() };
  RegisterFileSchema.parse(register);
  PendingReviewFileSchema.parse(pendingReview);

  const result = validateRegister({ register, pendingReview }, { today: AUDIT_DATE });
  for (const i of result.errors) console.error(formatIssue(i));
  for (const i of result.warnings) console.warn(formatIssue(i));
  console.log(`seed: ${SEED_PROJECTS.length} projects, ${pendingReview.items.length} pending — ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);

  const b = computeBriefing(SEED_PROJECTS, 2026, AUDIT_DATE);
  console.log(`briefing: ${b.headline}`);
  console.log(`briefing: delivered warehouse floor space by basis — ${subtotalsText(b.delivered.floorSubtotals)}`);
  console.log(`briefing: being built warehouse floor space by basis — ${subtotalsText(b.beingBuilt.floorSubtotals)}`);
  const m = computeMetrics(SEED_PROJECTS, 2026);
  const fmt = (b: { areas: Record<string, { totalM2: number }>; projectCount: number }) =>
    `${b.projectCount} projects, GFA ${b.areas.warehouse_gfa!.totalM2}, GLA ${b.areas.gla!.totalM2}, mixed ${b.areas.mixed_building_area!.totalM2}, unspecified ${b.areas.unspecified!.totalM2}`;
  console.log(`strict delivered 2026 — Grade A confirmed: ${fmt(m.gradeADelivered)}`);
  console.log(`strict delivered 2026 — Grade A probable: ${fmt(m.gradeAProbableDelivered)}`);
  console.log(`strict delivered 2026 — other: ${fmt(m.otherModernDelivered)}`);
  console.log(`strict under construction — all: ${fmt(m.underConstruction.all)}`);

  if (!result.ok) return 1;
  if (!check) {
    await writeFile(dataPath('register'), serializeDataFile(register));
    await writeFile(dataPath('pendingReview'), serializeDataFile(pendingReview));
    console.log('wrote data/register.json and data/pending-review.json');
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
