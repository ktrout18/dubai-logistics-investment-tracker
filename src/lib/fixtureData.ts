/**
 * DEV-ONLY fictional data for working on the UI before the real register is
 * seeded. Loaded only through `?fixtures=1` in a dev build (or a build made
 * with VITE_ENABLE_FIXTURES=1). Every page shows a "fictional data" banner
 * while this is active. Never shipped as real data.
 */
import { FIXTURE_PROJECTS } from '../../shared/__fixtures__/projects.ts';
import type { ChangeRecord, PendingReviewItem, Project } from '../../shared/index.ts';
import type { SiteData } from './loadData.ts';
import { derivePresentation } from './presentation.ts';

export function fixtureSiteData(): SiteData {
  const projects: Project[] = FIXTURE_PROJECTS.map((p, i) => {
    const umbrella = FIXTURE_PROJECTS.some((q) => q.parentId === p.id);
    if (umbrella || p.emirate !== 'Dubai') return p;
    const pres = derivePresentation(p, { counted: true });
    // Mimic the briefing: openings are 2026 deliveries; later deliveries were added after it.
    if (pres.section === 'openings' && !p.actualCompletion?.date.startsWith('2026')) pres.section = 'added_after_pdf';
    return {
      ...p,
      presentation: {
        ...pres,
        pdfRef: i + 1,
        sortOrder: i,
        ...(i === 0 ? { differsFromSources: 'Fixture note: the briefing rounds the area; sources give 49,982 m².' } : {}),
      },
    };
  });
  const changes: ChangeRecord[] = [
    {
      id: 'chg-20270210-aaaa0001',
      projectId: 'kappa-commercity-fulfilment-centre',
      field: 'status',
      previousValue: 'investment_committed',
      newValue: 'under_construction',
      evidenceUrl: 'https://news.example.com/kappa-start',
      evidenceDate: '2026-02-01',
      reason: 'Groundbreaking reported by the developer (fixture).',
      verificationStatus: 'verified_official',
      appliedAt: '2027-02-10T06:00:00Z',
      appliedBy: 'pipeline',
    },
    {
      id: 'chg-20270201-aaaa0002',
      projectId: 'alpha-jafza-grade-a-dc',
      field: 'areas[0].valueM2',
      previousValue: 50000,
      newValue: 49981.84,
      evidenceUrl: 'https://news.example.com/alpha-opened',
      evidenceDate: '2026-03-15',
      reason: 'Exact conversion of 538,000 sq ft (fixture).',
      verificationStatus: 'verified_multiple',
      appliedAt: '2027-02-01T06:00:00Z',
      appliedBy: 'manual',
    },
  ];
  const items: PendingReviewItem[] = [
    {
      id: 'rev-20270212-bbbb0001',
      createdAt: '2027-02-12T06:00:00Z',
      kind: 'new_project',
      proposed: { name: 'Mu Cold Chain Hub', zone: 'Dubai South' },
      evidence: [{ url: 'https://news.example.com/mu-hub', publishedDate: '2027-02-11', quote: 'plans a 30,000 sq m cold store' }],
      reasonHeld: 'Single secondary source; area basis not stated (fixture).',
      state: 'open',
    },
  ];
  return {
    register: { schemaVersion: 1, updatedAt: '2027-02-15T06:00:00Z', projects },
    meta: {
      schemaVersion: 1,
      lastSuccessfulRun: '2027-02-15T06:00:00Z',
      lastAttemptedRun: '2027-02-15T06:00:00Z',
      lastRunStatus: 'success',
      sourceScans: [],
      coverageLimitations: [
        'FICTIONAL TEST DATA. These projects do not exist.',
        'The register is not exhaustive: it lists only projects found in public sources.',
      ],
      exhaustive: false,
    },
    changelog: { schemaVersion: 1, changes },
    pendingReview: { schemaVersion: 1, items },
  };
}
