/**
 * Triage of grounded candidate facts before the publication decision. It only
 * ever removes claims from the review queue (never publishes), and every
 * removed claim is counted in the run report with its reason:
 *
 * - `outside_uae`: the claim is about a place outside the UAE.
 * - `not_a_facility`: the model classed it as a corridor/route, a service or
 *   market commentary rather than a logistics facility or investment.
 * - `restates_recorded_milestone`: the claim adds nothing to a project the
 *   register already has (same milestone recorded; no stated date, area or
 *   investment), so it could never be published and only adds review noise.
 * - `regional`: the claim is in another emirate. It is not queued for review
 *   and never enters the register automatically; it is kept as a "regional
 *   mention" (run report + data/pipeline-state.json) for the owner.
 *
 * A claim that points to Dubai (emirate, a Dubai zone, or "Dubai" in its
 * location) is never classed as outside the UAE or regional.
 */
import { KNOWN_ZONES, normaliseText, type Emirate, type Project } from '../shared/index.ts';
import type { PipelineConfig } from './config.ts';
import type { CandidateFact } from './extraction.ts';
import type { GroundedFact } from './grounding.ts';
import { AMBIGUOUS_FLOOR, matchFact } from './match.ts';

export type TriageReason = 'outside_uae' | 'not_a_facility' | 'restates_recorded_milestone';

export type TriageResult =
  | { action: 'keep' }
  | { action: 'skip'; reason: TriageReason; detail: string }
  | { action: 'regional'; emirate: Exclude<Emirate, 'Dubai' | 'Other'>; detail: string };

const UAE_NAMES = ['united arab emirates', 'uae', 'u a e'];

function placeText(f: Pick<CandidateFact, 'location' | 'zone' | 'locationQuote' | 'projectName' | 'facilityName'>): string {
  return normaliseText([f.location, f.zone, f.locationQuote, f.projectName, f.facilityName].filter(Boolean).join(' | '));
}

function hasWord(text: string, phrase: string): boolean {
  const p = normaliseText(phrase);
  return p.length > 0 && new RegExp(`(^| )${p.replace(/ /g, ' ')}( |$)`).test(text);
}

const DUBAI_HINTS = ['dubai', 'jebel ali', 'al maktoum', 'dwc', 'warsan', ...KNOWN_ZONES.filter((z) => z.emirate === 'Dubai').flatMap((z) => [z.name, ...z.aliases])];

/** True when anything in the claim places it in Dubai. */
export function pointsToDubai(f: CandidateFact): boolean {
  if (f.emirate === 'Dubai') return true;
  const t = placeText(f);
  return DUBAI_HINTS.some((h) => hasWord(t, h));
}

/** The other emirate a claim is in, from the model's emirate or a known place in the text. */
export function otherEmirate(f: CandidateFact, config: Pick<PipelineConfig, 'triage'>): Exclude<Emirate, 'Dubai' | 'Other'> | undefined {
  if (f.emirate && f.emirate !== 'Dubai' && f.emirate !== 'Other') return f.emirate;
  const t = placeText(f);
  for (const z of KNOWN_ZONES) {
    if (z.emirate !== 'Dubai' && z.emirate !== 'Other' && [z.name, ...z.aliases].some((a) => hasWord(t, a))) return z.emirate;
  }
  for (const [place, emirate] of Object.entries(config.triage.otherEmiratePlaces)) {
    if (hasWord(t, place)) return emirate;
  }
  return undefined;
}

/** A place outside the UAE named by the claim (stated country, or a configured foreign place name). */
export function foreignPlace(f: CandidateFact, config: Pick<PipelineConfig, 'triage'>): string | undefined {
  const country = f.country ? normaliseText(f.country) : '';
  if (country && !UAE_NAMES.includes(country)) return f.country!;
  const t = placeText(f);
  return config.triage.foreignPlaces.find((p) => hasWord(t, p));
}

export function triageFact(
  item: { grounded: GroundedFact; doc: { url: string; recheckProjectId?: string } },
  projects: readonly Project[],
  config: Pick<PipelineConfig, 'triage'>,
): TriageResult {
  const f = item.grounded.fact;
  if (config.triage.skipClaimKinds.includes(f.claimKind)) {
    return { action: 'skip', reason: 'not_a_facility', detail: `classed as ${f.claimKind.replace(/_/g, ' ')}` };
  }
  if (!pointsToDubai(f)) {
    const foreign = f.emirate ? undefined : foreignPlace(f, config);
    if (foreign) return { action: 'skip', reason: 'outside_uae', detail: `located outside the UAE (${foreign})` };
    const other = otherEmirate(f, config);
    if (other) return { action: 'regional', emirate: other, detail: `located in ${other}` };
  }
  // A restatement of a milestone the register already records, with nothing
  // that could be published (no stated date, area or investment).
  const g = item.grounded;
  const undated = !g.eventDate || g.eventDate.from === 'publication_date';
  if (undated && g.areas.length === 0 && !f.investment) {
    const { candidates } = matchFact(f, item.doc.url, projects, item.doc.recheckProjectId);
    for (const c of candidates.filter((x) => x.score >= AMBIGUOUS_FLOOR)) {
      const p = projects.find((x) => x.id === c.projectId);
      const ev = p?.events.find((e) => e.type === f.eventType);
      if (p && ev) {
        return { action: 'skip', reason: 'restates_recorded_milestone', detail: `already recorded as ${p.id} event ${ev.id}` };
      }
    }
  }
  return { action: 'keep' };
}
