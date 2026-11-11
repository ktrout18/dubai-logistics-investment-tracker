import { describe, expect, it } from 'vitest';
import {
  ISSUE_CODES,
  SCHEMA_VERSION,
  formatIssue,
  validateProjects,
  validateRegister,
  type IssueCode,
  type Project,
  type ValidationResult,
} from '../index.ts';
import { FIXTURE_PROJECTS, FIXTURE_TODAY, alpha, cloneProjects, zeta } from '../__fixtures__/projects.ts';

const today = FIXTURE_TODAY;
const reg = (projects: unknown[]) => ({ schemaVersion: SCHEMA_VERSION, projects });
const run = (projects: unknown[], extra: Record<string, unknown> = {}) =>
  validateRegister({ register: reg(projects), ...extra }, { today });
const codes = (r: ValidationResult) => [...r.errors, ...r.warnings, ...r.notices].map((i) => i.code);
const errCodes = (r: ValidationResult) => r.errors.map((i) => i.code);
const warnCodes = (r: ValidationResult) => r.warnings.map((i) => i.code);
function mutate(id: string, fn: (p: Project, all: Project[]) => void): Project[] {
  const ps = cloneProjects();
  fn(ps.find((p) => p.id === id)!, ps);
  return ps;
}

describe('fixtures and empty data', () => {
  it('fixtures validate with no errors and no warnings', () => {
    const r = run(cloneProjects());
    expect(r.errors.map(formatIssue)).toEqual([]);
    expect(r.warnings.map(formatIssue)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags the non-Dubai fixture as regional (notice)', () => {
    const r = run(cloneProjects());
    expect(r.notices.map((n) => [n.code, n.projectId])).toEqual([['REGIONAL_PROJECT', 'theta-sharjah-hub']]);
  });

  it('empty register with all files validates', () => {
    const r = validateRegister(
      {
        register: reg([]),
        changelog: { schemaVersion: 1, changes: [] },
        pendingReview: { schemaVersion: 1, items: [] },
        meta: { schemaVersion: 1, lastRunStatus: 'never_run', sourceScans: [], coverageLimitations: [], exhaustive: false },
        sources: { schemaVersion: 1, sources: [] },
      },
      { today },
    );
    expect(r.ok).toBe(true);
  });

  it('every emitted code is declared with a fixed severity', () => {
    const r = run([{ id: 'X' }]);
    for (const i of [...r.errors, ...r.warnings]) expect(ISSUE_CODES[i.code].severity).toBe(i.severity);
  });
});

describe('schema', () => {
  it('rejects malformed projects with paths', () => {
    const r = run([{ ...alpha, status: 'finished' }]);
    expect(errCodes(r)).toContain('SCHEMA_INVALID');
    expect(r.errors[0]!.path).toBe('projects[0].status');
  });

  it('rejects unknown fields (strict)', () => {
    expect(errCodes(run([{ ...alpha, colour: 'red' }]))).toContain('SCHEMA_INVALID');
  });

  it('rejects a meta file that claims to be exhaustive', () => {
    const r = validateRegister(
      { register: reg([]), meta: { schemaVersion: 1, lastRunStatus: 'success', sourceScans: [], coverageLimitations: [], exhaustive: true } },
      { today },
    );
    expect(r.errors.some((e) => e.code === 'SCHEMA_INVALID' && e.file === 'meta')).toBe(true);
  });

  it('rejects an invented AED conversion (amountAed without derivation)', () => {
    const r = run(mutate(alpha.id, (p) => delete p.investment!.amountAedDerivation));
    expect(errCodes(r)).toContain('SCHEMA_INVALID');
  });
});

describe('duplicates', () => {
  it('duplicate ids are errors', () => {
    const ps = cloneProjects();
    ps.push({ ...ps[0]! });
    expect(errCodes(run(ps))).toContain('DUPLICATE_ID');
  });

  it('probable duplicate facility (similar name, same zone, same operator) is a warning', () => {
    const ps = cloneProjects();
    ps.push({
      ...JSON.parse(JSON.stringify(alpha)),
      id: 'alpha-logistics-jafza-dc-2',
      name: 'Alpha Logistics Grade-A Distribution Centre Jafza',
      zone: 'Jebel Ali Free Zone',
      sources: alpha.sources.map((s) => ({ ...s, url: `${s.url}-copy` })),
    });
    const r = run(ps);
    expect(warnCodes(r)).toContain('PROBABLE_DUPLICATE');
    expect(r.ok).toBe(true); // warning only
  });

  it('same name in a different zone is not a duplicate', () => {
    const ps = cloneProjects();
    ps.push({
      ...JSON.parse(JSON.stringify(alpha)),
      id: 'alpha-dic-dc',
      zone: 'Dubai Industrial City',
      sources: alpha.sources.map((s) => ({ ...s, url: `${s.url}-dic` })),
    });
    expect(warnCodes(run(ps))).not.toContain('PROBABLE_DUPLICATE');
  });

  it('same source URL on two unrelated projects is a warning; phases sharing it are fine', () => {
    expect(warnCodes(run(cloneProjects()))).not.toContain('SHARED_SOURCE_URL'); // zeta family shares URLs
    const ps = mutate('beta-dic-gla-park', (p) => {
      p.sources.push({ url: alpha.sources[0]!.url, type: 'secondary', verification: 'indexed' });
    });
    expect(warnCodes(run(ps))).toContain('SHARED_SOURCE_URL');
  });
});

describe('events and status', () => {
  it('unsorted events are an error', () => {
    const r = run(mutate(alpha.id, (p) => p.events.reverse()));
    expect(errCodes(r)).toContain('EVENTS_NOT_SORTED');
  });

  it('status inconsistent with events is an error', () => {
    const r = run(mutate(alpha.id, (p) => (p.status = 'under_construction')));
    expect(errCodes(r)).toContain('STATUS_EVENT_MISMATCH');
  });

  it('invalid (backward) transition in history is caught', () => {
    const r = run(
      mutate(alpha.id, (p) => {
        p.events.push({ ...p.events[1]!, id: 'regress', date: '2026-04-01', type: 'construction_milestone', summary: 'regress' });
        p.latestMilestone = { ...p.latestMilestone, date: '2026-04-01', sourceUrl: p.events[1]!.sourceUrl };
      }),
    );
    expect(errCodes(r)).toContain('INVALID_TRANSITION');
  });

  it('a backward move flagged as correction is allowed', () => {
    const r = run(
      mutate(alpha.id, (p) => {
        p.events.push({ ...p.events[1]!, id: 'fix', date: '2026-04-01', type: 'correction', statusAfter: 'under_construction', summary: 'Opening was misreported' });
        p.status = 'under_construction';
        delete p.actualCompletion;
        p.latestMilestone = { ...p.latestMilestone, date: '2026-04-01', sourceUrl: p.events[1]!.sourceUrl };
      }),
    );
    expect(errCodes(r)).not.toContain('INVALID_TRANSITION');
    expect(r.ok).toBe(true);
  });

  it('moving out of cancelled is invalid', () => {
    const r = run(
      mutate('iota-dic-dangerous-goods-store', (p) => {
        p.events.push({ ...p.events[0]!, id: 'revive', date: '2026-09-01', type: 'construction_start', summary: 'Revived' });
        p.status = 'under_construction';
        p.latestMilestone = { ...p.latestMilestone, date: '2026-09-01', sourceUrl: p.events[0]!.sourceUrl };
      }),
    );
    expect(errCodes(r)).toContain('INVALID_TRANSITION');
  });

  it('latestMilestone older than the newest event is an error', () => {
    const r = run(mutate(alpha.id, (p) => (p.latestMilestone = { ...p.latestMilestone, date: '2025-01-15' })));
    expect(errCodes(r)).toContain('LATEST_MILESTONE_STALE');
  });

  it('future events are errors', () => {
    const r = run(mutate('kappa-commercity-fulfilment-centre', (p) => (p.events[1]!.date = '2027-05-01')));
    expect(errCodes(r)).toContain('EVENT_IN_FUTURE');
  });
});

describe('completion dates', () => {
  it('delivered status without actualCompletion is an error', () => {
    expect(errCodes(run(mutate(alpha.id, (p) => delete p.actualCompletion)))).toContain('DELIVERED_WITHOUT_ACTUAL_COMPLETION');
  });

  it('actualCompletion without a sourceUrl fails the schema', () => {
    const r = run(mutate(alpha.id, (p) => delete (p.actualCompletion as Partial<NonNullable<Project['actualCompletion']>>).sourceUrl));
    expect(errCodes(r)).toContain('SCHEMA_INVALID');
  });

  it('actual completion in the future is an error', () => {
    const r = validateRegister({ register: reg(cloneProjects()) }, { today: '2027-01-31' });
    expect(r.errors.some((e) => e.code === 'ACTUAL_COMPLETION_IN_FUTURE' && e.projectId === 'zeta-logistics-park-phase-1')).toBe(true);
  });

  it('forecast promoted to actual with the same source is an error', () => {
    const r = run(
      mutate(alpha.id, (p) => {
        p.forecastCompletion = { date: '2026-03-15', datePrecision: 'day', sourceUrl: p.actualCompletion!.sourceUrl };
      }),
    );
    expect(errCodes(r)).toContain('FORECAST_PROMOTED_WITHOUT_SOURCE');
  });

  it('actual completion evidenced by a source published before completion is an error', () => {
    const r = run(
      mutate(alpha.id, (p) => {
        p.actualCompletion!.sourceUrl = p.originalAnnouncement!.sourceUrl; // published 2024
      }),
    );
    expect(errCodes(r)).toContain('ACTUAL_COMPLETION_SOURCE_PREDATES');
  });

  it('actualCompletion on a non-delivered project is an error', () => {
    const r = run(mutate('kappa-commercity-fulfilment-centre', (p) => (p.actualCompletion = { date: '2026-12-01', datePrecision: 'month', sourceUrl: p.events[1]!.sourceUrl })));
    expect(errCodes(r)).toContain('ACTUAL_COMPLETION_STATUS_MISMATCH');
  });

  it('overdue forecast is a warning', () => {
    const r = validateRegister({ register: reg(cloneProjects()) }, { today: '2027-07-15' });
    expect(r.warnings.some((w) => w.code === 'FORECAST_OVERDUE' && w.projectId === 'kappa-commercity-fulfilment-centre')).toBe(true);
  });
});

describe('phasing integrity', () => {
  it('missing parent is an error', () => {
    expect(errCodes(run(mutate('zeta-logistics-park-phase-1', (p) => (p.parentId = 'no-such-park'))))).toContain('PARENT_NOT_FOUND');
  });

  it('self parent and cycles are errors', () => {
    expect(errCodes(run(mutate(alpha.id, (p) => ((p.parentId = p.id), (p.phaseLabel = 'x')))))).toContain('PARENT_SELF');
    const cyc = mutate(zeta.id, (p) => {
      p.parentId = 'zeta-logistics-park-phase-1';
      p.phaseLabel = 'loop';
    });
    expect(errCodes(run(cyc))).toContain('PHASE_CYCLE');
  });

  it('phase areas exceeding the parent is a warning', () => {
    const r = run(mutate('zeta-logistics-park-phase-2', (p) => (p.areas[0]!.valueM2 = 70_000)));
    expect(warnCodes(r)).toContain('PHASE_AREA_EXCEEDS_PARENT');
    expect(r.ok).toBe(true);
  });
});

describe('units and areas', () => {
  it('converted value not matching the original is an error', () => {
    // 538,000 sq ft stored as if it were m²
    const r = run(mutate(alpha.id, (p) => (p.areas[0]!.valueM2 = 538_000)));
    expect(errCodes(r)).toContain('AREA_CONVERSION_MISMATCH');
  });

  it('rounding within tolerance is accepted', () => {
    const r = run(mutate(alpha.id, (p) => (p.areas[0]!.valueM2 = 49_982)));
    expect(errCodes(r)).not.toContain('AREA_CONVERSION_MISMATCH');
  });

  it('implausible m² is a warning', () => {
    const r = run(mutate(alpha.id, (p) => (p.areas[0] = { valueM2: 5_000_000, basis: 'warehouse_gfa', sourceUrl: p.areas[0]!.sourceUrl })));
    expect(warnCodes(r)).toContain('AREA_IMPLAUSIBLE');
  });

  it('area without a source is an error; primary pointing at land is a warning', () => {
    expect(errCodes(run(mutate(alpha.id, (p) => delete p.areas[0]!.sourceUrl)))).toContain('AREA_UNSOURCED');
    expect(warnCodes(run(mutate(alpha.id, (p) => (p.primaryAreaIndex = 1))))).toContain('PRIMARY_AREA_NOT_FLOOR');
    expect(errCodes(run(mutate(alpha.id, (p) => (p.primaryAreaIndex = 5))))).toContain('PRIMARY_AREA_INDEX_OUT_OF_RANGE');
  });

  it('wrong USD peg conversion is an error', () => {
    const r = run(mutate('delta-nip-land-plot', (p) => (p.investment!.amountAed = 185_000_000)));
    expect(errCodes(r)).toContain('AED_CONVERSION_MISMATCH');
  });
});

describe('sourcing and URLs', () => {
  it('invalid URL syntax is an error', () => {
    const r = run(mutate(alpha.id, (p) => (p.sources[0]!.url = 'news.example.com/no-scheme')));
    expect(errCodes(r)).toContain('INVALID_URL');
  });

  it('disclosed investment without a source is an error', () => {
    expect(errCodes(run(mutate(alpha.id, (p) => delete p.investment!.sourceUrl)))).toContain('INVESTMENT_UNSOURCED');
  });

  it('cited URL missing from sources[] is a warning', () => {
    const r = run(mutate(alpha.id, (p) => (p.sources = p.sources.filter((s) => !s.url.endsWith('alpha-ground')))));
    expect(warnCodes(r)).toContain('URL_NOT_IN_SOURCES');
  });

  it('Grade-A confirmed without evidence is an error', () => {
    expect(errCodes(run(mutate(alpha.id, (p) => delete p.gradeAEvidence)))).toContain('GRADE_A_EVIDENCE_MISSING');
  });
});

describe('geography and normalisation', () => {
  it('known Dubai zone on a non-Dubai project is a warning', () => {
    const r = run(mutate(alpha.id, (p) => (p.emirate = 'Sharjah')));
    expect(warnCodes(r)).toContain('ZONE_EMIRATE_MISMATCH');
    expect(codes(r)).toContain('REGIONAL_PROJECT');
  });

  it('alias zone spelling is a warning', () => {
    expect(warnCodes(run(mutate(alpha.id, (p) => (p.zone = 'JAFZA'))))).toContain('ZONE_NOT_NORMALISED');
  });

  it('companies missing a role company is a warning', () => {
    expect(warnCodes(run(mutate(alpha.id, (p) => (p.companies = []))))).toContain('COMPANIES_MISSING_ROLE');
  });

  it('month-precision dates must be the first of the month', () => {
    expect(warnCodes(run(mutate('beta-dic-gla-park', (p) => (p.events[0]!.date = '2025-02-14'))))).toContain(
      'DATE_PRECISION_NOT_NORMALISED',
    );
  });
});

describe('changelog and review queue', () => {
  const change = {
    id: 'chg-1',
    projectId: alpha.id,
    field: 'status',
    previousValue: 'under_construction',
    newValue: 'operational',
    evidenceUrl: 'https://news.example.com/alpha-opened',
    evidenceDate: '2026-03-15',
    reason: 'Opening reported',
    verificationStatus: 'verified_official',
    appliedAt: '2026-03-16T06:00:00Z',
    appliedBy: 'pipeline',
  };

  it('accepts records that reference existing projects', () => {
    const r = run(cloneProjects(), { changelog: { schemaVersion: 1, changes: [change] } });
    expect(r.ok).toBe(true);
  });

  it('changelog records referencing unknown projects are errors', () => {
    const r = run(cloneProjects(), { changelog: { schemaVersion: 1, changes: [{ ...change, projectId: 'ghost-project' }] } });
    expect(errCodes(r)).toContain('CHANGELOG_UNKNOWN_PROJECT');
  });

  it('review items: update needs a known project; new_project needs none', () => {
    const base = {
      id: 'rev-1',
      createdAt: '2026-05-01T06:00:00Z',
      proposed: { name: 'Something' },
      evidence: [{ url: 'https://news.example.com/x' }],
      reasonHeld: 'Single secondary source',
      state: 'open',
    };
    expect(run([], { pendingReview: { schemaVersion: 1, items: [{ ...base, kind: 'new_project' }] } }).ok).toBe(true);
    const r = run([], { pendingReview: { schemaVersion: 1, items: [{ ...base, kind: 'update', projectId: 'ghost-project' }] } });
    expect(errCodes(r)).toContain('REVIEW_UNKNOWN_PROJECT');
    const r2 = run([], { pendingReview: { schemaVersion: 1, items: [{ ...base, kind: 'update' }] } });
    expect(errCodes(r2)).toContain('SCHEMA_INVALID');
  });
});

describe('validateProjects', () => {
  it('runs semantic checks without the file envelope', () => {
    const r = validateProjects(cloneProjects(), { today });
    expect(r.ok).toBe(true);
    const all: IssueCode[] = codes(r);
    expect(all).toEqual(['REGIONAL_PROJECT']);
  });

  it('fixtures count stays ≥ 8', () => {
    expect(FIXTURE_PROJECTS.length).toBeGreaterThanOrEqual(8);
  });
});
