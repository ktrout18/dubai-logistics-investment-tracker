/**
 * Source registry for the 2026 seed. Every entry traces to
 * research/pdf-sources.json, research/seed-research.json, or a page read
 * directly while assembling the seed on 11 Nov 2026 (marked "read 11 Nov").
 *
 * verification: 'direct' = page text was read (by the research worker or
 * while seeding); 'indexed' = seen only via search-engine results.
 *
 * Evidence audit (12 Nov 2026, docs/AUDIT_2026-11.md): every page on an
 * allowed host was re-read directly; those carry accessedDate 2026-11-12
 * (AUDIT). Pages that could only be re-searched keep 'indexed'.
 */
import type { Source } from '../../shared/index.ts';

const A = '2026-11-11';
/** Audit date (docs/AUDIT_2026-11.md): pages re-read directly, or re-searched, on 12 Nov 2026. */
const AUDIT = '2026-11-12';

function s(
  url: string,
  title: string,
  publisher: string,
  publishedDate: string | null,
  type: Source['type'],
  verification: Source['verification'],
  accessedDate: string = A,
): Source {
  return { url, title, publisher, ...(publishedDate ? { publishedDate } : {}), type, accessedDate, verification };
}

export const SOURCES = {
  // --- Aldar / NIP / ESF -----------------------------------------------------
  aldarQ3: s(
    'https://www.aldar.com/en/news-and-media/aldar-delivers-robust-q3-performance-with-net-profit-rising-19-to-aed-7-1-billion-in-first-nine-months-of-2026',
    'Aldar delivers robust Q3 performance with net profit rising 19% to AED 7.1 billion in first nine months of 2026',
    'Aldar Properties', '2026-10-27', 'primary', 'direct', AUDIT),
  aldarPortfolio: s('https://www.aldar.com/en/industrial-and-logistics', 'Industrial and Logistics (portfolio page)', 'Aldar Properties', null, 'primary', 'direct', AUDIT),
  aldarLogisticsCentres: s('https://www.aldar.com/properties/en/logistics-centres', 'Aldar Logistics Centres (NIP leasing page)', 'Aldar Properties', null, 'primary', 'direct', AUDIT),
  gnAldar2024: s(
    'https://gulfnews.com/business/property/uae-master-developer-aldar-inks-pact-with-dp-world-to-build-logistics-park-in-dubai-1.1721036326513',
    'UAE master developer Aldar inks pact with DP World to build logistics park in Dubai', 'Gulf News', '2024-07-15', 'secondary', 'direct', AUDIT),
  wamAldar2024: s('https://www.wam.ae/en/article/140mm3q-aldar-world-sign-agreement-develop-grade-logistics',
    'Aldar, DP World sign agreement to develop Grade A logistics park in Dubai', 'WAM', '2024-07-15', 'primary', 'indexed'),
  wamAldarPhased: s('https://www.wam.ae/en/article/bmvnenj-aldar-advances-phased-delivery-grade-logistics',
    'Aldar advances phased delivery of Grade A logistics park at National Industries Park in Dubai', 'WAM', null, 'primary', 'indexed', AUDIT),
  tvAldarPhased: s(
    'https://www.tradingview.com/news/reuters.com,2025-11-24:newsml_Zaw5Xxgcf:0-pressr-aldar-advances-phased-delivery-of-grade-a-logistics-park-at-national-industries-park-in-dubai/',
    'PRESSR: Aldar advances phased delivery of grade a logistics park at national industries park in Dubai',
    'TradingView / Reuters (Zawya PRESSR)', '2025-11-24', 'secondary', 'indexed', AUDIT),
  aldar9m2024: s(
    'https://cdn.aldar.com/-/media/project/aldar-tenant/aldar2/9m-2024-financial-results/aldar-properties-results-presentation-9m-2024_final.pdf?rev=59b0cc6159c84e76b44da261bc75ada9',
    'Aldar Properties 9M 2024 Results Presentation', 'Aldar Properties', '2024-10-29', 'primary', 'indexed', AUDIT),
  aldarEsf2025: s('https://www.aldar.com/en/news-and-media/aldar-breaks-ground-on-a-custom-designed-cold-store-facility',
    'Aldar breaks ground on a custom designed cold store facility for Emirates Snack Foods', 'Aldar Properties', '2025-05-22', 'primary', 'direct', AUDIT),

  // --- dnata ------------------------------------------------------------------
  dnata2024: s('https://www.dnata.com/media-centre/dnata-logistics-to-expand-uae-footprint-with-new-57000-m-facility-in-dubai-south/',
    'dnata Logistics to expand UAE footprint with new, 57,000 m² facility in Dubai South', 'dnata', '2024-12-05', 'primary', 'direct', AUDIT), // read 11 Nov
  dnataApr2025: s('https://www.mediaoffice.ae/en/news/2025/april/14-04/dnata-brings-global-cargo-investments',
    'dnata brings global cargo investments and future-focused infrastructure to the spotlight at IATA World Cargo Symposium',
    'Government of Dubai Media Office', '2025-04-14', 'primary', 'direct', AUDIT),
  dnataH1: s('https://www.dnata.com/media-centre/emirates-group-announces-half-year-profit-for-2026-27-despite-full-six-month-impact-of-regional-conflict-and-high-fuel-costs/',
    'Emirates Group announces half-year profit for 2026-27, despite full six-month impact of regional conflict and high fuel costs',
    'dnata (Emirates Group release)', '2026-11-05', 'primary', 'direct', AUDIT), // read 11 Nov
  moEmiratesH1: s('https://mediaoffice.ae/en/news/2026/novemebr/05-11/the-emirates-group-has-announced-its-results-for-the-first-six-months',
    'Emirates Group announces half-year profit for 2026-27', 'Government of Dubai Media Office', '2026-11-05', 'primary', 'direct', AUDIT), // read 11 Nov (was indexed)

  // --- Emirates engineering ---------------------------------------------------
  emiratesMro: s('https://www.emirates.com/media-centre/emirates-breaks-ground-on-us-51-billion-ultra-modern-engineering-facility-at-dubai-south/',
    'Emirates breaks ground on US$ 5.1 billion ultra-modern engineering facility at Dubai South', 'Emirates', '2026-05-18', 'primary', 'direct', AUDIT),
  emiratesH1: s('https://www.emirates.com/media-centre/emirates-group-announces-half-year-profit-for-2026-27-despite-full-six-month-impact-of-regional-conflict-and-high-fuel-costs/',
    'Emirates Group announces half-year profit for 2026-27', 'Emirates Group', '2026-11-05', 'primary', 'direct', AUDIT),
  tnEmirates2023: s('https://www.thenationalnews.com/business/aviation/2023/11/14/emirates-to-build-950m-engineering-hub-at-dubai-world-central/',
    'Emirates airline to build $950m engineering centre at Dubai World Central', 'The National', '2023-11-14', 'secondary', 'direct', AUDIT),

  // --- DSV / Lintara ----------------------------------------------------------
  gnDsv: s('https://gulfnews.com/gn-focus/dsv-expands-in-dubai-with-new-30000-sqm-logistics-warehouse-in-jebel-ali-free-zone-developed-by-arcapitas-lintara-1.500548335',
    'DSV expands in Dubai with new 30,000 sqm logistics warehouse in Jebel Ali Free Zone developed by Arcapita\'s Lintara',
    'Gulf News (GN Focus, sponsored press-release content)', '2026-05-21', 'secondary', 'direct', AUDIT),
  arcapitaDsv2026: s('https://arcapita.com/insights/dsv-expands-in-dubai-with-new-30-000-sqm-logistics-warehouse-in-jebel-ali-free-zone-developed-by-arcapita-s-lintara/',
    'DSV expands in Dubai with new 30,000 sqm logistics warehouse in Jebel Ali Free Zone developed by Arcapita\'s Lintara',
    'Arcapita', '2026-05-21', 'primary', 'indexed', AUDIT),
  tnDsv2025: s('https://www.thenationalnews.com/advertorial/2025/01/29/arcapita-and-dsv-partner-to-build-state-of-the-art-sustainable-warehouse-in-dubais-jebel-ali-free-zone/',
    'Arcapita and DSV partner to build state-of-the-art sustainable warehouse in Dubai\'s Jebel Ali Free Zone (advertorial)',
    'The National (advertorial)', '2025-01-29', 'secondary', 'direct', AUDIT),
  dsvPress: s('https://www.dsv.com/en-ae/about-dsv/press/news/new-dubai-warehouse-opens-2723848',
    'DSV opens new 30,000 sqm logistics facility in Jebel Ali Free zone, Dubai', 'DSV', null, 'primary', 'indexed', AUDIT), // audit 12 Nov: search results only
  dpwLintara: s('https://www.dpworld.com/en/news/releases/uae/dp-world-and-arcapitas-lintara-break-ground-on-20000-sqm-logistics-centre-in-jafza',
    'DP World and Arcapita\'s Lintara break ground on 20,000 sqm logistics centre in Jafza', 'DP World', '2026-06-30', 'primary', 'direct', AUDIT),

  // --- TECOM / DIC ------------------------------------------------------------
  dicSharqi: s('https://dubaiindustrialcity.ae/media/press-release/al-sharqi-shipping-inaugurates-aed-70-million-multi-temperature-integrated-logistics-and-distribution-hub-at-dubai-industrial-city',
    'Al Sharqi Shipping inaugurates AED 70 million multi-temperature integrated logistics and distribution hub at Dubai Industrial City',
    'Dubai Industrial City (TECOM Group)', '2026-10-15', 'primary', 'direct', AUDIT),
  dicTalal: s('https://dubaiindustrialcity.ae/media/press-release/talal-group-breaks-ground-on-aed-150-million-central-distribution-centre-at-dubai-industrial-city',
    'Talal Group breaks ground on AED 150 million Central Distribution Centre at Dubai Industrial City',
    'Dubai Industrial City (TECOM Group)', '2026-07-21', 'primary', 'direct', AUDIT),

  // --- CEVA ---------------------------------------------------------------------
  lmCeva: s('https://www.logisticsmanager.com/ceva-opens-new-e-commerce-warehouse-in-dubai', 'CEVA opens new e-commerce warehouse in Dubai', 'Logistics Manager', null, 'secondary', 'indexed', AUDIT),
  statCeva: s('https://www.stattimes.com/logistics/ceva-logistics-expands-regional-footprint-with-new-dubai-facility-1357832',
    'CEVA Logistics expands regional footprint with new Dubai facility', 'STAT Times', null, 'secondary', 'indexed', AUDIT),

  // --- Jafza / DP World ---------------------------------------------------------
  moGallega: s('https://www.mediaoffice.ae/en/news/2026/may/20-05/gallega-global-logistics-opens-logistics-hub-at-jafza',
    'Gallega Global Logistics Opens 215,000 sq. ft. 3PL Logistics Hub at Jafza', 'Dubai Media Office', '2026-05-20', 'primary', 'direct', AUDIT),
  jafzaGallega: s('https://www.jafza.ae/resource-centre/media/news/gallega-global-logistics-opens-215000-sq-ft-3pl-logistics-hub-at-jafza/',
    'Gallega Global Logistics Opens 215,000 sq. ft. 3PL Logistics Hub at Jafza', 'Jafza (DP World)', '2026-05-21', 'primary', 'direct', AUDIT),
  jafzaGallegaFeb: s('https://www.jafza.ae/resource-centre/media/news/ghassan-aboud-holding-easylease-launch-gallega-aftermarket-hub-at-jafza/',
    'Ghassan Aboud Holding, EasyLease Launch Gallega Aftermarket Hub at Jafza', 'Jafza (DP World)', '2026-02-11', 'primary', 'direct', AUDIT),
  xGallegaFvh: s('https://x.com/DXBMediaOffice/status/2044414836805943321',
    'Dubai Media Office post: Gallega Global Logistics launches an integrated Finished Vehicles Hub in Jafza', 'Dubai Media Office (X)', '2026-04-15', 'primary', 'indexed', AUDIT),
  taGallegaFvh: s('https://www.tradearabia.com/News/414062/Gallega-Global-Logistics-launches-1-million-sq-ft-finished-vehicles-hub-in-Jafza',
    'Gallega Global Logistics launches 1 million sq ft finished vehicles hub in Jafza', 'TradeArabia', null, 'secondary', 'indexed', AUDIT),
  ktPalmon: s('https://www.khaleejtimes.com/business/specialised-chemical-hub-opens-at-jebel-ali-free-zone', 'Specialised chemical hub opens at Jebel Ali Free Zone', 'Khaleej Times', '2026-01-14', 'secondary', 'direct', AUDIT),
  gnPalmon: s('https://gulfnews.com/business/corporate-news/gfh-partners-manrre-reit-and-palmon-group-open-11-million-regional-hub-for-specialised-chemical-storage-at-jafza-1.500409466',
    'GFH Partners Manrre REIT and Palmon Group open $11 million regional hub for specialised chemical storage at Jafza', 'Gulf News', '2026-01-15', 'secondary', 'direct', AUDIT),
  jafzaMosolf: s('https://www.jafza.ae/resource-centre/media/news/mosolf-launches-automotive-hub-in-jafza-to-expand-vehicle-processing-capacity/',
    'MOSOLF launches automotive hub in Jafza to expand vehicle processing capacity', 'Jafza (DP World)', '2026-05-21', 'primary', 'direct', AUDIT),
  dpwPetrochem: s('https://www.dpworld.com/en/news/releases/uae/petrochem-and-dp-world-inaugurate-aed-300-million-terminal-at-jebel-ali-port',
    'Petrochem and DP World inaugurate AED 300 million terminal at Jebel Ali Port', 'DP World', '2026-01-14', 'primary', 'direct', AUDIT),
  dpwAwir: s('https://www.dpworld.com/en/news/releases/uae/dp-world-moves-500000-teus-across-gcc-overland-network',
    'DP World moves 500,000 TEUs across GCC overland network', 'DP World', '2026-08-21', 'primary', 'direct', AUDIT),
  jafzaHellmannIndu: s('https://www.jafza.ae/resource-centre/media/news/jafza-expands-automotive-ecosystem-with-new-hellmann-indu-logistics-hub/',
    'Jafza expands automotive ecosystem with new Hellmann-Indu logistics hub', 'Jafza (DP World)', '2026-06-08', 'primary', 'direct', AUDIT),
  dpwFood: s('https://www.dpworld.com/en/news/releases/uae/dp-world-announces-dubai-food-district-a-new-hub-for-global-food-trade',
    'DP World announces Dubai Food District, a new hub for global food trade', 'DP World', '2026-01-22', 'primary', 'direct', AUDIT),
  molMou2023: s('https://www.mol.co.jp/en/pr/2023/23148.html', 'MOL and DP World sign MoU to Explore Auto logistics and Decarbonization Business Opportunities',
    'Mitsui O.S.K. Lines', '2023-12-07', 'primary', 'indexed', AUDIT),
  splashMol: s('https://splash247.com/dp-world-and-mol-move-jebel-ali-automotive-hub-plan-forward/', 'DP World and MOL move Jebel Ali automotive hub plan forward', 'Splash247', null, 'secondary', 'indexed', AUDIT),
  marklinesMol: s('https://www.marklines.com/en/news/352124',
    'DP World and MOL sign term sheet for proposed automotive logistics and processing facility at Jebel Ali Port (news summary)', 'MarkLines', null, 'secondary', 'indexed', AUDIT), // audit 12 Nov: search results only
  cnMol: s('https://container-news.com/dp-world-and-mol-plan-new-automotive-logistics-facility-at-jebel-ali/',
    'DP World and MOL plan new automotive logistics facility at Jebel Ali', 'Container News', null, 'secondary', 'indexed', AUDIT),

  // --- Dubai South / MBRAH -----------------------------------------------------
  dsDior: s('https://www.dubaisouth.ae/en/newsroom/dubai-south-welcomes-dior-regional-distribution-centre', 'Dubai South welcomes Dior Regional Distribution Centre', 'Dubai South', '2026-09-21', 'primary', 'direct', AUDIT),
  dsHellmann: s('https://www.dubaisouth.ae/en/newsroom/dubai-south-welcomes-new-distribution-facility-by-hellmann-calipar-healthcare-logistics-at-the-logistics-district',
    'Dubai South welcomes new distribution facility by Hellmann Calipar Healthcare Logistics at the Logistics District', 'Dubai South', '2026-03-31', 'primary', 'direct', AUDIT),
  moLht: s('https://mediaoffice.ae/en/news/2026/march/25-03/mohammed-bin-rashid-aerospace-hub', 'MBRAH And Lufthansa Technik ME Inaugurate New Aviation Facility in Dubai',
    'Dubai Media Office', '2026-03-25', 'primary', 'direct', AUDIT),
  dsPhoenix: s('https://www.dubaisouth.ae/en/newsroom/dubai-south-signs-agreement-with-phoenix-aviation-for-a-new-airside-facility-at-mohammed-bin-rashid-aerospace-hub',
    'Dubai South signs agreement with Phoenix Aviation for a new airside facility at Mohammed bin Rashid Aerospace Hub', 'Dubai South', '2026-10-30', 'primary', 'direct', AUDIT),
  moSkyLaunch: s('https://www.mediaoffice.ae/en/news/2025/august/12-08/mohammed-bin-rashid-aerospace-hub-launches-sky-support-complex-to-meet-growing-industry-demand',
    'Mohammed bin Rashid Aerospace Hub launches Sky Support Complex to meet growing industry demand', 'Government of Dubai Media Office', '2025-08-12', 'primary', 'direct', AUDIT),
  dsSkyJul2026: s('https://www.dubaisouth.ae/en/newsroom/mohammed-bin-rashid-aerospace-hub-advances-construction-of-sky-support-complex-completion-expected-by-end-of-q3-2026',
    'Mohammed Bin Rashid Aerospace Hub advances construction of Sky Support Complex, completion expected by end of Q3 2026', 'Dubai South', '2026-07-28', 'primary', 'direct', AUDIT), // read 11 Nov
  tollDc6: s('https://www.tollgroup.com/about/news-and-media/toll-group-announces-groundbreaking-cwt-sml-dc6-facility-dubai-south',
    'Toll Group Announces Groundbreaking of CWT-SML DC6 Facility in Dubai South', 'Toll Group', null, 'primary', 'indexed', AUDIT),
  dsToll: s('https://www.dubaisouth.ae/en/newsroom/dubai-south-and-toll-group-break-ground-on-state-of-the-art-logistics',
    'Dubai South and Toll Group break ground on state-of-the-art logistics facility', 'Dubai South', '2025-08-29', 'primary', 'direct', AUDIT), // read 11 Nov (was indexed)
  moToll: s('https://www.mediaoffice.ae/en/news/2025/august/29-08/dubai-south-and-toll-group', 'Dubai South and Toll Group break ground on state-of-the-art logistics facility',
    'Government of Dubai Media Office', '2025-08-29', 'primary', 'direct', AUDIT),
  dhl2025: s('https://group.dhl.com/en/media-relations/press-releases/2025/dhl-opens-next-gen-innovation-center-in-dubai.html',
    'DHL opens next-gen Innovation Center and builds a state-of-the-art contract logistics warehouse in Dubai, UAE', 'DHL Group', '2025-12-04', 'primary', 'indexed', AUDIT),
  lmeRobotics2026: s('https://logisticsmiddleeast.com/special-reports/the-gulfs-logistics-robotics-market-in-2026', 'The Gulf\'s logistics robotics market in 2026',
    'Logistics Middle East', null, 'secondary', 'indexed'),

  // --- Other signed / announced ---------------------------------------------------
  moGargash: s('https://mediaoffice.ae/en/news/2026/october/15-10/gargash-prime',
    'Gargash Prime and JINGDONG Property sign joint venture to develop a 2.5 million sq. ft. plot of land for a Dubai Logistics Facility in the UAE',
    'Dubai Media Office', '2026-10-15', 'primary', 'direct', AUDIT),
  tnCommercity: s('https://www.thenationalnews.com/business/economy/2026/10/04/dubai-to-expand-commercity-in-push-for-digital-economy-growth/',
    'Dubai to expand CommerCity in push for digital economy growth', 'The National', '2026-10-04', 'secondary', 'direct', AUDIT),

  // --- Terralogix -----------------------------------------------------------------
  terralogixSite: s('https://terralogix.ae/', 'Terralogix - Dubai\'s Premium Logistics Hub', 'Terralogix (Dutco / Sweid & Sweid)', null, 'primary', 'indexed', AUDIT),
  sweidLaunch: s('https://sweidandsweid.com/dutco-sweid-sweid-launch-dubais-largest-privately-owned-logistics-park/',
    'Dutco, Sweid & Sweid Launch Dubai\'s Largest Privately-Owned Logistics Park', 'Sweid & Sweid', null, 'primary', 'indexed', AUDIT),
  enterpriseTerralogix: s('https://enterpriseam.com/uae/2025/06/11/dutco-sweid-sweid-to-build-dubais-largest-private-owned-logistics-park/',
    'Dutco + Sweid & Sweid to build Dubai\'s largest private-owned logistics park', 'Enterprise AM', '2025-06-11', 'secondary', 'indexed', AUDIT),
} satisfies Record<string, Source>;

export type SourceKey = keyof typeof SOURCES;
