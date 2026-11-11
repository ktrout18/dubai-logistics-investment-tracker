/**
 * TEST FIXTURES — fictional projects for unit tests only. Not real data.
 * All URLs use the reserved example.* domains. Never copy into data/.
 *
 * Coverage: Grade-A confirmed delivered (GFA + land), GLA-based delivered,
 * probable Grade-A delivered, land-area-only, open yard, umbrella with two
 * phases, MoU, Sharjah regional, cancelled, under construction with a
 * forecast, mixed building area.
 */
import type { Project, ProjectEvent, Source } from '../schema.ts';
import { deriveCompanies } from '../normalise.ts';

/** "Today" for validating these fixtures (all delivery dates are on or before it). */
export const FIXTURE_TODAY = '2027-03-01';

const TS = '2027-02-15T06:00:00Z';

type EventInput = Omit<ProjectEvent, 'id' | 'datePrecision' | 'sourceType' | 'verification'> &
  Partial<Pick<ProjectEvent, 'id' | 'datePrecision' | 'sourceType' | 'verification'>>;

function ev(e: EventInput): ProjectEvent {
  return {
    id: e.id ?? `${e.date}-${e.type.replace(/_/g, '-')}`,
    datePrecision: e.datePrecision ?? 'day',
    sourceType: e.sourceType ?? 'primary',
    verification: e.verification ?? 'direct',
    ...e,
  } as ProjectEvent;
}

type FixtureInput = Omit<
  Project,
  'companies' | 'latestMilestone' | 'sources' | 'createdAt' | 'updatedAt' | 'provenance' | 'lastVerified' | 'confidence' | 'unresolvedQuestions'
> &
  Partial<Pick<Project, 'latestMilestone' | 'sources' | 'provenance' | 'lastVerified' | 'confidence' | 'unresolvedQuestions'>> & {
    /** publishedDate per URL for auto-generated sources. */
    published?: Record<string, string>;
  };

/** Build a fixture: derives companies, latestMilestone (from the last event) and sources (from every cited URL). */
export function fixture(input: FixtureInput): Project {
  const { published = {}, ...rest } = input;
  const last = rest.events[rest.events.length - 1];
  const latestMilestone =
    rest.latestMilestone ??
    (last
      ? { date: last.date, datePrecision: last.datePrecision, description: last.summary, sourceUrl: last.sourceUrl }
      : undefined);
  if (!latestMilestone) throw new Error(`fixture ${rest.id} needs events or latestMilestone`);
  const urls = new Set<string>();
  const add = (u?: string) => u && urls.add(u);
  add(rest.originalAnnouncement?.sourceUrl);
  add(latestMilestone.sourceUrl);
  add(rest.investment?.sourceUrl);
  rest.areas.forEach((a) => add(a.sourceUrl));
  add(rest.forecastCompletion?.sourceUrl);
  add(rest.actualCompletion?.sourceUrl);
  rest.events.forEach((e) => add(e.sourceUrl));
  const sources: Source[] =
    rest.sources ??
    [...urls].map((url) => ({
      url,
      title: `Fixture source ${url}`,
      publisher: 'Example Publisher',
      ...(published[url] ? { publishedDate: published[url] } : {}),
      type: 'primary',
      verification: 'direct',
    }));
  return {
    ...rest,
    companies: deriveCompanies(rest),
    latestMilestone,
    sources,
    provenance: rest.provenance ?? 'manual',
    lastVerified: rest.lastVerified ?? '2027-02-15',
    confidence: rest.confidence ?? 'high',
    unresolvedQuestions: rest.unresolvedQuestions ?? [],
    createdAt: TS,
    updatedAt: TS,
  };
}

const U = (slug: string) => `https://news.example.com/${slug}`;

export const alpha = fixture({
  id: 'alpha-jafza-grade-a-dc',
  name: 'Alpha Logistics Jafza Grade-A Distribution Centre',
  summary: 'Grade-A distribution centre in Jafza, delivered March 2026 (fixture).',
  developer: 'Alpha Logistics LLC',
  operator: 'Alpha Logistics',
  emirate: 'Dubai',
  location: 'Jebel Ali, Dubai',
  zone: 'Jafza',
  sectors: ['grade_a_warehousing', 'fashion_luxury_ecommerce'],
  assetType: 'distribution_centre',
  status: 'operational',
  originalAnnouncement: { date: '2024-05-10', datePrecision: 'day', sourceUrl: U('alpha-announce') },
  investment: {
    amount: 250_000_000,
    currency: 'AED',
    amountAed: 250_000_000,
    amountAedDerivation: 'native_aed',
    basis: 'Total development cost',
    disclosed: true,
    sourceUrl: U('alpha-announce'),
  },
  areas: [
    { valueM2: 49981.84, basis: 'warehouse_gfa', originalValue: 538_000, originalUnit: 'sqft', sourceUrl: U('alpha-opened') },
    { valueM2: 100_000, basis: 'site_land_area', originalValue: 10, originalUnit: 'hectare', sourceUrl: U('alpha-announce') },
  ],
  primaryAreaIndex: 0,
  gradeA: 'confirmed',
  gradeAEvidence: 'Developer specification: 12 m clear height, FM2 floors, LEED Gold.',
  netNew: 'yes',
  netNewEvidence: 'Opened March 2026 on a greenfield plot.',
  actualCompletion: { date: '2026-03-15', datePrecision: 'day', sourceUrl: U('alpha-opened') },
  events: [
    ev({ date: '2024-05-10', type: 'announcement', summary: 'Project announced', sourceUrl: U('alpha-announce') }),
    ev({ date: '2025-01-15', type: 'construction_start', summary: 'Ground broken', sourceUrl: U('alpha-ground') }),
    ev({ date: '2026-03-15', type: 'opened', summary: 'Facility opened', sourceUrl: U('alpha-opened') }),
  ],
  published: { [U('alpha-opened')]: '2026-03-15', [U('alpha-announce')]: '2024-05-10' },
});

export const beta = fixture({
  id: 'beta-dic-gla-park',
  name: 'Beta Industrial Park',
  summary: 'Multi-let logistics park measured by GLA (fixture).',
  developer: 'Beta Developments',
  emirate: 'Dubai',
  location: 'Dubai Industrial City',
  zone: 'Dubai Industrial City',
  sectors: ['modern_warehousing'],
  assetType: 'logistics_park',
  status: 'construction_completed',
  areas: [{ valueM2: 30_000, basis: 'gla', originalValue: 30_000, originalUnit: 'sqm', sourceUrl: U('beta-complete') }],
  primaryAreaIndex: 0,
  gradeA: 'unverified',
  netNew: 'yes',
  netNewEvidence: 'Completion reported June 2026.',
  actualCompletion: { date: '2026-06-01', datePrecision: 'month', sourceUrl: U('beta-complete') },
  events: [
    ev({ date: '2025-02-01', datePrecision: 'month', type: 'construction_start', summary: 'Works began', sourceUrl: U('beta-start') }),
    ev({ date: '2026-06-01', datePrecision: 'month', type: 'construction_completed', summary: 'Construction completed', sourceUrl: U('beta-complete') }),
  ],
  published: { [U('beta-complete')]: '2026-06-20' },
});

export const gamma = fixture({
  id: 'gamma-dubai-south-probable-dc',
  name: 'Gamma Freight Distribution Centre',
  summary: 'Modern DC with likely Grade-A specification (fixture).',
  operator: 'Gamma Freight',
  emirate: 'Dubai',
  location: 'Dubai South',
  zone: 'Dubai South – Logistics District',
  sectors: ['grade_a_warehousing'],
  assetType: 'distribution_centre',
  status: 'operational',
  investment: { basis: 'Not disclosed', disclosed: false },
  areas: [{ valueM2: 20_000, basis: 'warehouse_gfa', sourceUrl: U('gamma-opened') }],
  primaryAreaIndex: 0,
  gradeA: 'probable',
  gradeAEvidence: 'Described as "state-of-the-art" with 12 m height; no certification published.',
  netNew: 'yes',
  netNewEvidence: 'New build.',
  actualCompletion: { date: '2026-09-14', datePrecision: 'day', sourceUrl: U('gamma-opened') },
  events: [
    ev({ date: '2025-03-01', type: 'agreement_signed', summary: 'Land lease signed', sourceUrl: U('gamma-lease') }),
    ev({ date: '2025-06-01', type: 'construction_start', summary: 'Construction started', sourceUrl: U('gamma-start') }),
    ev({ date: '2026-09-14', type: 'opened', summary: 'Opened', sourceUrl: U('gamma-opened') }),
  ],
  published: { [U('gamma-opened')]: '2026-09-14' },
});

export const delta = fixture({
  id: 'delta-nip-land-plot',
  name: 'Delta Manufacturing & Logistics Plot',
  summary: 'Land lease signed; only the plot area is known (fixture).',
  investor: 'Delta Holdings',
  emirate: 'Dubai',
  location: 'National Industries Park',
  zone: 'National Industries Park',
  sectors: ['industrial_machinery'],
  assetType: 'mixed_industrial',
  status: 'signed_agreement',
  investment: {
    amount: 50_000_000,
    currency: 'USD',
    amountAed: 183_625_000,
    amountAedDerivation: 'usd_peg',
    basis: 'Stated investment',
    disclosed: true,
    sourceUrl: U('delta-signed'),
  },
  areas: [{ valueM2: 200_000, basis: 'site_land_area', originalValue: 20, originalUnit: 'hectare', sourceUrl: U('delta-signed') }],
  gradeA: 'unverified',
  netNew: 'unknown',
  events: [ev({ date: '2026-04-20', type: 'agreement_signed', summary: 'Land lease agreement signed', sourceUrl: U('delta-signed') })],
});

export const epsilon = fixture({
  id: 'epsilon-jafza-open-yard',
  name: 'Epsilon Container Yard',
  summary: 'Open storage yard; no building (fixture).',
  operator: 'Epsilon Terminals',
  emirate: 'Dubai',
  location: 'Jebel Ali',
  zone: 'Jafza',
  sectors: ['multimodal_container_inland'],
  assetType: 'open_yard',
  status: 'operational',
  areas: [{ valueM2: 80937.13, basis: 'open_yard', originalValue: 20, originalUnit: 'acre', sourceUrl: U('epsilon-opened') }],
  gradeA: 'not_applicable',
  netNew: 'yes',
  netNewEvidence: 'New yard.',
  actualCompletion: { date: '2026-02-01', datePrecision: 'month', sourceUrl: U('epsilon-opened') },
  events: [
    ev({ date: '2025-10-01', datePrecision: 'month', type: 'construction_start', summary: 'Yard works began', sourceUrl: U('epsilon-start') }),
    ev({ date: '2026-02-01', datePrecision: 'month', type: 'opened', summary: 'Yard opened', sourceUrl: U('epsilon-opened') }),
  ],
});

export const zeta = fixture({
  id: 'zeta-logistics-park',
  name: 'Zeta Logistics Park',
  summary: 'Two-phase logistics park (umbrella; fixture).',
  developer: 'Zeta Real Estate',
  emirate: 'Dubai',
  location: 'Dubai South',
  zone: 'Dubai South – Logistics District',
  sectors: ['grade_a_warehousing'],
  assetType: 'logistics_park',
  status: 'under_construction',
  investment: { amount: 500_000_000, currency: 'AED', amountAed: 500_000_000, amountAedDerivation: 'native_aed', basis: 'Whole park, both phases', disclosed: true, sourceUrl: U('zeta-announce') },
  areas: [
    { valueM2: 100_000, basis: 'warehouse_gfa', sourceUrl: U('zeta-announce') },
    { valueM2: 500_000, basis: 'district_area', sourceUrl: U('zeta-announce') },
  ],
  primaryAreaIndex: 0,
  gradeA: 'probable',
  gradeAEvidence: 'Marketed as Grade-A.',
  netNew: 'yes',
  netNewEvidence: 'Announced 2026.',
  events: [
    ev({ date: '2026-01-20', type: 'announcement', summary: 'Park announced', sourceUrl: U('zeta-announce') }),
    ev({ date: '2026-03-01', type: 'construction_start', summary: 'Phase 1 works began', sourceUrl: U('zeta-start') }),
  ],
});

export const zetaPhase1 = fixture({
  id: 'zeta-logistics-park-phase-1',
  name: 'Zeta Logistics Park – Phase 1',
  summary: 'Phase 1 of Zeta Logistics Park (fixture).',
  developer: 'Zeta Real Estate',
  emirate: 'Dubai',
  location: 'Dubai South',
  zone: 'Dubai South – Logistics District',
  sectors: ['grade_a_warehousing'],
  assetType: 'warehouse',
  status: 'operational',
  parentId: 'zeta-logistics-park',
  phaseLabel: 'Phase 1',
  investment: { amount: 200_000_000, currency: 'AED', amountAed: 200_000_000, amountAedDerivation: 'native_aed', basis: 'Phase 1 capex', disclosed: true, sourceUrl: U('zeta-announce') },
  areas: [{ valueM2: 40_000, basis: 'warehouse_gfa', sourceUrl: U('zeta-p1-opened') }],
  primaryAreaIndex: 0,
  gradeA: 'confirmed',
  gradeAEvidence: 'LEED Gold certificate and published spec sheet.',
  netNew: 'yes',
  netNewEvidence: 'Opened 2027.',
  actualCompletion: { date: '2027-02-10', datePrecision: 'day', sourceUrl: U('zeta-p1-opened') },
  events: [
    ev({ date: '2026-01-20', type: 'announcement', summary: 'Phase 1 announced with park', sourceUrl: U('zeta-announce') }),
    ev({ date: '2026-03-01', type: 'construction_start', summary: 'Works began', sourceUrl: U('zeta-start') }),
    ev({ date: '2027-02-10', type: 'opened', summary: 'Phase 1 opened', sourceUrl: U('zeta-p1-opened') }),
  ],
  published: { [U('zeta-p1-opened')]: '2027-02-10' },
});

export const zetaPhase2 = fixture({
  id: 'zeta-logistics-park-phase-2',
  name: 'Zeta Logistics Park – Phase 2',
  summary: 'Phase 2 of Zeta Logistics Park (fixture).',
  developer: 'Zeta Real Estate',
  emirate: 'Dubai',
  location: 'Dubai South',
  zone: 'Dubai South – Logistics District',
  sectors: ['grade_a_warehousing'],
  assetType: 'warehouse',
  status: 'under_construction',
  parentId: 'zeta-logistics-park',
  phaseLabel: 'Phase 2',
  investment: { basis: 'Not disclosed separately', disclosed: false },
  areas: [{ valueM2: 60_000, basis: 'warehouse_gfa', sourceUrl: U('zeta-announce') }],
  primaryAreaIndex: 0,
  gradeA: 'probable',
  gradeAEvidence: 'Same specification as Phase 1 per developer.',
  netNew: 'yes',
  netNewEvidence: 'Under construction.',
  forecastCompletion: { date: '2027-10-01', datePrecision: 'month', sourceUrl: U('zeta-p2-start') },
  events: [
    ev({ date: '2026-01-20', type: 'announcement', summary: 'Phase 2 announced with park', sourceUrl: U('zeta-announce') }),
    ev({ date: '2026-09-01', type: 'construction_start', summary: 'Phase 2 works began', sourceUrl: U('zeta-p2-start') }),
  ],
});

export const eta = fixture({
  id: 'eta-dubai-south-cold-store-mou',
  name: 'Eta Foods Cold Store',
  summary: 'Non-binding MoU for a cold store (fixture).',
  investor: 'Eta Foods',
  emirate: 'Dubai',
  location: 'Dubai South',
  zone: 'Dubai South – Logistics District',
  sectors: ['food_fmcg_cold_chain'],
  assetType: 'cold_store',
  status: 'mou',
  investment: {
    amount: 100_000_000,
    currency: 'USD',
    amountAed: 367_250_000,
    amountAedDerivation: 'usd_peg',
    basis: 'Indicative MoU value',
    disclosed: true,
    sourceUrl: U('eta-mou'),
  },
  areas: [{ valueM2: 15_000, basis: 'unspecified', sourceUrl: U('eta-mou'), note: 'Source says "15,000 sqm facility"' }],
  gradeA: 'unverified',
  netNew: 'unknown',
  events: [ev({ date: '2026-07-15', type: 'mou', summary: 'MoU signed', sourceUrl: U('eta-mou') })],
});

export const theta = fixture({
  id: 'theta-sharjah-hub',
  name: 'Theta Regional Hub',
  summary: 'Grade-A hub in Sharjah — regional context only (fixture).',
  operator: 'Theta Logistics',
  emirate: 'Sharjah',
  location: 'Hamriyah',
  zone: 'Hamriyah Free Zone',
  sectors: ['grade_a_warehousing'],
  assetType: 'warehouse',
  status: 'operational',
  areas: [{ valueM2: 25_000, basis: 'warehouse_gfa', sourceUrl: U('theta-opened') }],
  primaryAreaIndex: 0,
  gradeA: 'confirmed',
  gradeAEvidence: 'Published specification.',
  netNew: 'yes',
  netNewEvidence: 'Opened 2026.',
  actualCompletion: { date: '2026-05-01', datePrecision: 'month', sourceUrl: U('theta-opened') },
  events: [
    ev({ date: '2025-04-01', datePrecision: 'month', type: 'construction_start', summary: 'Works began', sourceUrl: U('theta-start') }),
    ev({ date: '2026-05-01', datePrecision: 'month', type: 'opened', summary: 'Opened', sourceUrl: U('theta-opened') }),
  ],
});

export const iota = fixture({
  id: 'iota-dic-dangerous-goods-store',
  name: 'Iota Chemicals DG Store',
  summary: 'Dangerous-goods store; agreement later cancelled (fixture).',
  investor: 'Iota Chemicals',
  emirate: 'Dubai',
  location: 'Dubai Industrial City',
  zone: 'Dubai Industrial City',
  sectors: ['chemicals_dangerous_goods'],
  assetType: 'dangerous_goods_store',
  status: 'cancelled',
  investment: { amount: 80_000_000, currency: 'AED', amountAed: 80_000_000, amountAedDerivation: 'native_aed', basis: 'Stated capex', disclosed: true, sourceUrl: U('iota-signed') },
  areas: [{ valueM2: 10_000, basis: 'warehouse_gfa', sourceUrl: U('iota-signed') }],
  primaryAreaIndex: 0,
  gradeA: 'unverified',
  netNew: 'unknown',
  events: [
    ev({ date: '2026-02-10', type: 'agreement_signed', summary: 'Agreement signed', sourceUrl: U('iota-signed') }),
    ev({ date: '2026-08-01', type: 'cancelled', summary: 'Project cancelled', sourceUrl: U('iota-cancelled') }),
  ],
});

export const kappa = fixture({
  id: 'kappa-commercity-fulfilment-centre',
  name: 'Kappa E-commerce Fulfilment Centre',
  summary: 'Fulfilment centre under construction (fixture).',
  operator: 'Kappa Commerce',
  emirate: 'Dubai',
  location: 'Al Twar',
  zone: 'Dubai CommerCity',
  sectors: ['fashion_luxury_ecommerce'],
  assetType: 'fulfilment_centre',
  status: 'under_construction',
  investment: { basis: 'Not disclosed', disclosed: false },
  areas: [{ valueM2: 15_000, basis: 'gla', sourceUrl: U('kappa-signed') }],
  primaryAreaIndex: 0,
  gradeA: 'unverified',
  netNew: 'yes',
  netNewEvidence: 'Under construction.',
  forecastCompletion: { date: '2027-06-01', datePrecision: 'month', sourceUrl: U('kappa-start') },
  events: [
    ev({ date: '2026-05-05', type: 'agreement_signed', summary: 'Lease agreement signed', sourceUrl: U('kappa-signed') }),
    ev({ date: '2026-10-01', type: 'construction_start', summary: 'Construction started', sourceUrl: U('kappa-start') }),
  ],
});

export const lambda = fixture({
  id: 'lambda-dip-mixed-building',
  name: 'Lambda Trading Warehouse & Offices',
  summary: 'Building area reported only as a combined warehouse + office figure (fixture).',
  owner: 'Lambda Trading',
  emirate: 'Dubai',
  location: 'Dubai Investments Park',
  zone: 'DIP',
  sectors: ['automotive_spare_parts'],
  assetType: 'warehouse',
  status: 'operational',
  areas: [{ valueM2: 12_000, basis: 'mixed_building_area', sourceUrl: U('lambda-opened') }],
  primaryAreaIndex: 0,
  gradeA: 'unverified',
  netNew: 'yes',
  netNewEvidence: 'Opened Nov 2026.',
  actualCompletion: { date: '2026-11-01', datePrecision: 'month', sourceUrl: U('lambda-opened') },
  events: [
    ev({ date: '2025-08-01', datePrecision: 'month', type: 'construction_start', summary: 'Works began', sourceUrl: U('lambda-start') }),
    ev({ date: '2026-11-01', datePrecision: 'month', type: 'opened', summary: 'Opened', sourceUrl: U('lambda-opened') }),
  ],
});

/** All fixtures, in register order. */
export const FIXTURE_PROJECTS: readonly Project[] = [
  alpha,
  beta,
  gamma,
  delta,
  epsilon,
  zeta,
  zetaPhase1,
  zetaPhase2,
  eta,
  theta,
  iota,
  kappa,
  lambda,
];

/** Deep clone helper so tests can mutate freely. */
export function cloneProjects(ps: readonly Project[] = FIXTURE_PROJECTS): Project[] {
  return JSON.parse(JSON.stringify(ps)) as Project[];
}
