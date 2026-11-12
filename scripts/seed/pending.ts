/**
 * Items held for human review at seeding (data/pending-review.json).
 * Each traces to research/seed-research.json or to a page read directly on
 * 11 Nov 2026; `reasonHeld` says why it is not (yet) a register project.
 */
import { makeReviewId, type PendingReviewItem } from '../../shared/index.ts';
import { SEED_TS } from './lib.ts';

type ItemInput = Omit<PendingReviewItem, 'id' | 'createdAt' | 'state'>;

const inputs: ItemInput[] = [
  {
    kind: 'conflict',
    projectId: 'dnata-logistics-dubai-south-warehouse',
    proposed: { status: 'operational' },
    evidence: [
      {
        url: 'https://www.dnata.com/media-centre/emirates-group-announces-half-year-profit-for-2026-27-despite-full-six-month-impact-of-regional-conflict-and-high-fuel-costs/',
        publishedDate: '2026-11-05',
        quote: 'It also continued to deliver its global cargo and logistics strategy through targeted investments across its network, commissioning its new AED 100 million (US$ 27 million) logistics facility in Dubai South',
      },
      { url: 'https://mediaoffice.ae/en/news/2026/novemebr/05-11/the-emirates-group-has-announced-its-results-for-the-first-six-months', publishedDate: '2026-11-05', quote: 'commissioning its new AED 100 million (US$ 27 million) logistics facility in Dubai South' },
    ],
    reasonHeld:
      'Still unresolved after the 12 Nov 2026 audit. The owner\'s PDF counts the dnata warehouse as opened (Apr to Sep). All three copies of the Emirates Group H1 2026-27 release (dnata.com, emirates.com, Dubai Media Office; re-read 12 Nov 2026) say "commissioning", neither "commissioned" nor "opened"; the dnata newsroom has no opening release (11 Nov) and a search on 12 Nov found none. The register keeps status construction_completed; change to operational only on a source that says operations began.',
  },
  {
    kind: 'conflict',
    projectId: 'emirates-snack-foods-cold-store-dubai-south',
    proposed: { status: 'operational' },
    evidence: [
      {
        url: 'https://www.aldar.com/en/news-and-media/aldar-delivers-robust-q3-performance-with-net-profit-rising-19-to-aed-7-1-billion-in-first-nine-months-of-2026',
        publishedDate: '2026-10-27',
        quote: 'Following completion in Q2, the Emirates Snack Foods facility has started to meaningfully contribute to segment EBITDA.',
      },
    ],
    reasonHeld:
      'Still unresolved after the 12 Nov 2026 audit. The PDF counts the Emirates Snack Foods cold store as opened (Q2). Aldar\'s Q3 2026 release (re-read 12 Nov 2026) reports completion in Q2 and segment EBITDA from the facility, but no source states that operations began or gives an opening date (search 12 Nov 2026 found none). Status kept at construction_completed.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: '7 Central logistics hub, Dubai Investments Park (Aldar)', emirate: 'Dubai', zone: 'DIP',
      areas: [{ valueM2: 19000, basis: 'gla', note: 'current GLA; adjacent plot to "almost double" it' }],
    },
    evidence: [
      { url: 'https://www.aldar.com/en/news-and-media/aldar-invests-aed-1b-to-expand-uae-logistics-real-estate', quote: 'acquisition of 7 Central ... current gross leasable area (GLA) of 19,000 sqm (search results only)' },
      { url: 'https://www.aldar.com/en/industrial-and-logistics', quote: '7 Central — Grade A Logistics Park, consisting of multiple warehouse units with high specification (Aldar portfolio page)' },
    ],
    reasonHeld:
      'Existing stock acquired by Aldar in January 2024 (not new supply), and no 2026 milestone was found for the adjacent expansion plot; Aldar\'s Q3 2026 release does not mention it. Add only when an expansion milestone (groundbreaking or completion) is sourced.',
  },
  {
    kind: 'new_project',
    proposed: { name: 'Arcapita / Lintara Properties GCC logistics development programme', emirate: 'Dubai' },
    evidence: [
      { url: 'https://www.dpworld.com/en/news/releases/uae/dp-world-and-arcapitas-lintara-break-ground-on-20000-sqm-logistics-centre-in-jafza', publishedDate: '2026-06-30', quote: 'The Grade A facility is being developed by Lintara Properties' },
      { url: 'https://arcapita.com/insights/dsv-expands-in-dubai-with-new-30-000-sqm-logistics-warehouse-in-jebel-ali-free-zone-developed-by-arcapita-s-lintara/', publishedDate: '2026-05-21' },
    ],
    reasonHeld:
      'Held, not a project: no source describing an Arcapita GCC programme (scope, size or value) was found in the research or read while seeding; the two pages above only show Lintara as Arcapita\'s development platform. Its two Dubai facilities are already in the register (PDF rows 3 and 19). A programme-level total would double count them.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'Iron Mountain warehousing and logistics facility (Unilever), EZDubai', emirate: 'Dubai', zone: 'Dubai South', status: 'operational',
      areas: [{ valueM2: 37000, basis: 'unspecified' }],
    },
    evidence: [
      { url: 'https://www.wam.ae/en/article/c363dd3-dubai-south-opens-iron-mountain%E2%80%99s-first-uae', publishedDate: '2026-11-09', quote: 'Dubai South opens Iron Mountain\'s first UAE logistics facility (search results only)' },
      { url: 'https://tradearabia.com/News/489403/Iron-Mountain-opens-37-000-sq-m-warehousing-facility-in-Dubai-South/IND', quote: 'Iron Mountain opens 37,000-sq m warehousing facility in Dubai South (search results only)' },
    ],
    reasonHeld:
      'Opened per reports dated 9 Nov 2026 (re-searched 12 Nov: WAM, Al Khaleej, TradeArabia, GDN, all search results only), after the PDF. No official page could be read (WAM pages need JavaScript; the item was not in the Dubai South newsroom on 11 Nov), the opening day itself is not stated, and one outlet gave 37,000 sq ft instead of sq m. Add to the register once an official page confirms area and date.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'Aramex regional healthcare and pharmaceutical hub, Dubai South Free Zone', emirate: 'Dubai', zone: 'Dubai South', status: 'operational',
      areas: [{ valueM2: 5600, basis: 'unspecified' }],
    },
    evidence: [
      {
        url: 'https://gulfnews.com/business/markets/aramex-opens-major-healthcare-hub-in-dubai-south-free-zone-1.500477306',
        publishedDate: '2026-03-17',
        quote: 'Logistics firm Aramex announced Tuesday it has opened its first dedicated regional healthcare and pharmaceutical hub at Dubai South Free Zone ... Spanning 5,600 square metres (read 11 Nov 2026)',
      },
      { url: 'https://www.zawya.com/en/press-release/companies-news/aramex-opens-first-regional-healthcare-hub-at-dubai-south-free-zone-wqw7o4bf', quote: 'Aramex opens first regional healthcare hub at Dubai South Free Zone (search results only)' },
    ],
    reasonHeld:
      'Identity, location, 5,600 m² and the March 2026 opening are confirmed by Gulf News (read directly), but no official Aramex or Dubai South page was read, and Aramex\'s own healthcare page refers to a facility in Dubai Logistics City. Not in the PDF. Add to the register once an official page is read.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'DP World multi-tenant warehouse development, Jafza (Group Amana contract)', emirate: 'Dubai', zone: 'Jafza', status: 'under_construction',
      areas: [{ valueM2: 141916, basis: 'mixed_building_area', note: 'built-up area, 187 units, seven blocks; may be the whole development' }],
    },
    evidence: [
      { url: 'https://www.meed.com/dp-world-awards-jafza-warehouse-construction-deal', publishedDate: '2026-03-18', quote: 'the development covers a built-up area of 141,916 sqm and 187 units across seven blocks (search results only)' },
      { url: 'https://constructionreviewonline.com/dp-world-jafza-warehouse-construction-deal-estimated-at-150-million/', quote: 'Deal Estimated at $150 Million (estimate, unverified)' },
    ],
    reasonHeld:
      'Contract award seen only through search results (MEED is paywalled; no DP World or Jafza release found). Unclear whether the built-up area covers the awarded package or the whole development. Checked against PDF rows 3 and 19: different schemes.',
  },
  {
    kind: 'new_project',
    proposed: { name: 'DP World chemical / dangerous-goods warehousing, Jafza North', emirate: 'Dubai', zone: 'Jafza' },
    evidence: [
      { url: 'https://gpcachem.org/2026/09/25/new-chemical-warehousing-capacity-to-open-in-jafza-north-this-november-2/', publishedDate: '2026-09-25', quote: 'New chemical warehousing capacity to open in Jafza North this November (search results only)' },
    ],
    reasonHeld:
      'Only a trade-association headline seen through search results: no area, developer or investment, and the November 2026 opening is unconfirmed (a 12 Nov 2026 search found nothing further). Not the same as PDF row 19 (Lintara DG centre, due Q1 2027), though it may relate to a smaller MEED-reported chemical storage scheme.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'Dubai CommerCity phase two expansion', emirate: 'Dubai', zone: 'Dubai CommerCity',
      investment: { amount: 1_800_000_000, currency: 'AED', disclosed: true },
      areas: [{ valueM2: 91000, basis: 'unspecified', note: 'The National: "more than 91,000 square metres of new office space" (Business and Social clusters 86,000 m²); not logistics space' }],
    },
    evidence: [
      { url: 'https://www.thenationalnews.com/business/economy/2026/10/04/dubai-to-expand-commercity-in-push-for-digital-economy-growth/', publishedDate: '2026-10-04', quote: 'On aggregate, the projects will add more than 91,000 square metres of new office space ... The expansion of the Business Cluster and the Social Cluster will add 86,000 square metres of new space ... Within the Logistics Cluster, the phase two expansion will add The Hive, a 5,600 square metre facility (re-read 12 Nov 2026)' },
      { url: 'https://www.gulftoday.ae/business/2026/10/04/dubai-commercity-launches-dhs-18-billion-expansion-to-accelerate-future-commerce-digital-economy-growth', publishedDate: '2026-10-04', quote: 'expansion adding 91,000 sqm (search results only)' },
    ],
    reasonHeld:
      'Overlaps PDF row 25 (The Hive is part of phase two). Re-read 12 Nov 2026: The National describes the 91,000 m² as "new office space" (86,000 m² in the Business and Social clusters), so it is not logistics floor space; the AED 1.8bn covers the whole expansion and the logistics share is not stated. Adding phase two as a project would double count The Hive; it could become an umbrella over The Hive if other logistics components are sourced.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'Legend Holding Group automotive hub, Jafza', emirate: 'Dubai', zone: 'Jafza', status: 'investment_committed',
      investment: { amount: 500_000_000, currency: 'AED', disclosed: true },
    },
    evidence: [
      { url: 'https://www.mediaoffice.ae/en/news/2025/december/11-12/legend-holding-group-to-invest', publishedDate: '2025-12-11', quote: 'Legend Holding Group is investing AED 500 million ... export hub first stage by April 2026 (search results only)' },
      { url: 'https://www.jafza.ae/resource-centre/media/news/legend-holding-group-to-invest-aed-500-million-in-major-automotive-hub-at-jafza/' },
    ],
    reasonHeld:
      'Announced Dec 2025 (before the 2026 window). The first stage (5,000 vehicles) was due by April 2026 but no delivery or construction milestone in 2026 has been sourced (re-searched 12 Nov 2026); area basis unclear. Checked against PDF rows 6, 10, 18 and 23: different operator.',
  },
  {
    kind: 'new_project',
    proposed: {
      name: 'Cars24 automotive refurbishment hub, National Industries Park', emirate: 'Dubai', zone: 'National Industries Park', status: 'investment_committed',
      investment: { amount: 55_000_000, currency: 'AED', disclosed: true },
    },
    evidence: [
      { url: 'https://www.mediaoffice.ae/en/news/2025/october/30-10/dp-world-cars', publishedDate: '2025-10-30', quote: 'DP World, Cars24 to build AED 55 mln auto hub at NIP; operations by August 2026 (search results only)' },
      { url: 'https://nip.ae/media/news/dp-world-cars24-to-build-aed-55m-auto-hub-at-nip/' },
    ],
    reasonHeld: 'Announced Oct 2025 (220,000 sq ft refurbishment centre per search results); construction was due to start Nov 2025 and operations by August 2026, but no 2026 construction or opening milestone has been sourced (re-searched 12 Nov 2026).',
  },
  {
    kind: 'new_project',
    proposed: { name: 'Kuehne+Nagel build-to-suit facility, Dubai South (Dubai South–Aldar)', emirate: 'Dubai', zone: 'Dubai South', areas: [{ valueM2: 22915, basis: 'unspecified' }] },
    evidence: [
      { url: 'https://www.dubaisouth.ae/en/newsroom/dubai-south-and-aldar-to-develop-build-to-suit-facility-for-global-logistics-firm-kuehnenagel', publishedDate: '2024-05-22', quote: 'covers an area of 22,915 square meters; handover expected Q2 2025 (search results only)' },
    ],
    reasonHeld:
      'Announced May 2024 with handover expected Q2 2025; no completion or 2026 milestone found (re-searched 12 Nov 2026). Aldar\'s portfolio page lists two Dubai South "Grade A Logistics Facility" assets (WE07 18,000 sqm, WE08 25,000 sqm) without dates; whether either is this facility is not stated.',
  },
  {
    kind: 'new_project',
    proposed: { name: 'MBRAH new Suppliers Complex (88 units), Dubai South', emirate: 'Dubai', zone: 'Dubai South', status: 'under_construction' },
    evidence: [
      {
        url: 'https://www.dubaisouth.ae/en/newsroom/mbrahs-new-suppliers-complex-progresses-with-opening-set-for-end-of-2026',
        publishedDate: '2026-09-02',
        quote: 'Upon completion by the end of 2026, the facility will feature 88 leasable units across three levels, catering to maintenance service providers, aircraft parts traders and aerospace companies (read 11 Nov 2026)',
      },
    ],
    reasonHeld:
      'Read directly, but no area, investment or construction-start date is given, and the units are mainly small aerospace SME spaces. Not in the PDF. Add if an area and a completion are confirmed.',
  },
  {
    kind: 'new_project',
    proposed: { name: 'DHL Global Forwarding 25,000 m² hub, Dubai South (unverified claim)', emirate: 'Dubai', zone: 'Dubai South' },
    evidence: [{ url: 'https://ports.marinelink.com/ports/port/mukilteo/news/dhl-global-forwarding-opens-advanced-logistics-hub-in-dubai', quote: 'officially opened its latest logistics facility (aggregator page; search results only)' }],
    reasonHeld: 'Claim appears only on an aggregator page with inconsistent dating; not corroborated by DHL or Dubai South. Likely unrelated to the DHL Supply Chain warehouse already in the register.',
  },
];

export function buildPendingItems(): PendingReviewItem[] {
  const ids: string[] = [];
  return inputs.map((inp) => {
    const base = { ...inp, createdAt: SEED_TS };
    const id = makeReviewId(base, ids);
    ids.push(id);
    return { id, ...base, state: 'open' as const };
  });
}
