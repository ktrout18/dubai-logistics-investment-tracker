/**
 * Match a grounded candidate fact to an existing project, by source URL first,
 * then by parties + zone + facility-name similarity. A unique, confident match
 * updates that project; a weak or tied match is "ambiguous" and is held.
 */
import { companyKey, jaccard, nameTokens, normaliseText, normaliseUrl, normaliseZone, type Project } from '../shared/index.ts';
import type { CandidateFact } from './extraction.ts';

export interface MatchCandidate {
  projectId: string;
  score: number;
  reasons: string[];
  /** Shared party, same source URL, or a very similar name: zone/asset type alone never identify a project. */
  identifying: boolean;
}

export type MatchResult =
  | { kind: 'existing'; project: Project; candidates: MatchCandidate[] }
  | { kind: 'new'; candidates: MatchCandidate[] }
  | { kind: 'ambiguous'; candidates: MatchCandidate[] };

export const MATCH_THRESHOLD = 6;
export const AMBIGUOUS_FLOOR = 3.5;

export function factParties(f: Pick<CandidateFact, 'developer' | 'operator' | 'investor' | 'owner'>): string[] {
  return [f.developer, f.operator, f.investor, f.owner].filter((x): x is string => !!x && x.trim().length > 0);
}

function partyOverlap(parties: string[], project: Project): string[] {
  const keys = project.companies.map(companyKey).filter(Boolean);
  const hits: string[] = [];
  for (const p of parties) {
    const k = companyKey(p);
    if (!k) continue;
    if (keys.some((pk) => pk === k || (pk.length >= 4 && k.length >= 4 && (pk.includes(k) || k.includes(pk))))) hits.push(p);
  }
  return hits;
}

export function zonesCompatible(a: string | undefined, b: string | undefined): boolean | undefined {
  if (!a || !b) return undefined;
  const za = normaliseText(normaliseZone(a));
  const zb = normaliseText(normaliseZone(b));
  if (za === zb) return true;
  // "Dubai South" vs "Dubai South – Logistics District": same master development.
  return za.startsWith(zb) || zb.startsWith(za);
}

export function scoreProject(fact: CandidateFact, docUrl: string, project: Project, recheckProjectId?: string): MatchCandidate {
  const reasons: string[] = [];
  let score = 0;
  let identifying = false;
  const url = normaliseUrl(docUrl);
  const projectUrls = new Set([...project.sources.map((s) => s.url), ...project.events.map((e) => e.sourceUrl)].map(normaliseUrl));
  if (projectUrls.has(url)) {
    score += 100;
    identifying = true;
    reasons.push('source URL already cited by this project');
  }
  if (recheckProjectId === project.id) {
    score += 1;
    reasons.push('found by a recheck search for this project');
  }
  const parties = partyOverlap(factParties(fact), project);
  if (parties.length) {
    score += 3;
    identifying = true;
    reasons.push(`shared parties: ${parties.join(', ')}`);
  }
  const zone = zonesCompatible(fact.zone ?? undefined, project.zone);
  if (zone === true) {
    score += 3;
    reasons.push(`same zone (${project.zone})`);
  } else if (zone === false) {
    score -= 5;
    reasons.push(`different zone (${fact.zone} vs ${project.zone})`);
  }
  if (fact.emirate && fact.emirate !== project.emirate) {
    score -= 10;
    reasons.push(`different emirate (${fact.emirate} vs ${project.emirate})`);
  }
  const sim = jaccard(
    nameTokens(`${fact.projectName} ${fact.facilityName ?? ''}`),
    nameTokens(`${project.name} ${project.facilityName ?? ''}`),
  );
  if (sim >= 0.5) {
    score += 3;
    identifying = true;
    reasons.push(`similar name (${sim.toFixed(2)})`);
  } else if (sim >= 0.25) {
    score += 1.5;
    reasons.push(`partly similar name (${sim.toFixed(2)})`);
  }
  if (fact.assetType === project.assetType) {
    score += 1;
    reasons.push('same asset type');
  }
  return { projectId: project.id, score, reasons, identifying };
}

export function matchFact(fact: CandidateFact, docUrl: string, projects: readonly Project[], recheckProjectId?: string): MatchResult {
  const scored = projects
    .map((p) => scoreProject(fact, docUrl, p, recheckProjectId))
    .filter((c) => c.score > 0 && c.identifying)
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  const candidates = scored.slice(0, 5);
  if (!top || top.score < AMBIGUOUS_FLOOR) return { kind: 'new', candidates };
  if (top.score >= MATCH_THRESHOLD && (!second || second.score <= top.score - 3)) {
    return { kind: 'existing', project: projects.find((p) => p.id === top.projectId)!, candidates };
  }
  return { kind: 'ambiguous', candidates };
}
