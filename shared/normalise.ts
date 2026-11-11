/**
 * Normalisers for free-text fields: industrial zones, company names, URLs and
 * names used in duplicate detection. Pure functions only.
 */
import type { Emirate, Project } from './schema.ts';

export interface KnownZone {
  /** Canonical name stored in `Project.zone`. */
  name: string;
  /** Longer human label for display. */
  label: string;
  emirate: Emirate;
  /** Lower-case alias strings (matched after normalisation). */
  aliases: readonly string[];
}

/** Known industrial / logistics zones. `zone` stays a free string; these are the canonical spellings. */
export const KNOWN_ZONES: readonly KnownZone[] = [
  {
    name: 'Jafza',
    label: 'Jebel Ali Free Zone (Jafza)',
    emirate: 'Dubai',
    aliases: ['jafza', 'jafz', 'jebel ali free zone', 'jebel ali freezone', 'jebel ali free zone authority', 'jebel ali'],
  },
  {
    name: 'Dubai South – Logistics District',
    label: 'Dubai South – Logistics District',
    emirate: 'Dubai',
    aliases: [
      'dubai south logistics district',
      'dubai south - logistics district',
      'logistics district dubai south',
      'dwc logistics district',
      'dubai logistics city',
      'dlc',
    ],
  },
  {
    name: 'Dubai South',
    label: 'Dubai South (other districts)',
    emirate: 'Dubai',
    aliases: ['dubai south', 'dubai world central', 'dwc'],
  },
  {
    name: 'Dubai Industrial City',
    label: 'Dubai Industrial City',
    emirate: 'Dubai',
    aliases: ['dubai industrial city', 'dic'],
  },
  {
    name: 'National Industries Park',
    label: 'National Industries Park (formerly TechnoPark)',
    emirate: 'Dubai',
    aliases: ['national industries park', 'nip', 'technopark', 'dubai technopark'],
  },
  {
    name: 'DIP',
    label: 'Dubai Investments Park (DIP)',
    emirate: 'Dubai',
    aliases: ['dip', 'dubai investments park', 'dubai investment park'],
  },
  {
    name: 'Dubai CommerCity',
    label: 'Dubai CommerCity',
    emirate: 'Dubai',
    aliases: ['dubai commercity', 'commercity', 'dubai commerce city'],
  },
  {
    name: 'Dubai Airport Freezone',
    label: 'Dubai Airport Freezone (DAFZ)',
    emirate: 'Dubai',
    aliases: ['dubai airport freezone', 'dubai airport free zone', 'dafz', 'dafza'],
  },
  {
    name: 'Al Quoz Industrial Area',
    label: 'Al Quoz Industrial Area',
    emirate: 'Dubai',
    aliases: ['al quoz industrial area', 'al quoz', 'al quoz industrial'],
  },
  {
    name: 'Ras Al Khor Industrial Area',
    label: 'Ras Al Khor Industrial Area',
    emirate: 'Dubai',
    aliases: ['ras al khor industrial area', 'ras al khor'],
  },
  {
    name: 'Al Qusais Industrial Area',
    label: 'Al Qusais Industrial Area',
    emirate: 'Dubai',
    aliases: ['al qusais industrial area', 'al qusais'],
  },
  {
    name: 'Dubai Maritime City',
    label: 'Dubai Maritime City',
    emirate: 'Dubai',
    aliases: ['dubai maritime city', 'dmc'],
  },
  {
    name: 'KEZAD',
    label: 'Khalifa Economic Zones Abu Dhabi (KEZAD)',
    emirate: 'Abu Dhabi',
    aliases: ['kezad', 'khalifa economic zones abu dhabi', 'khalifa industrial zone abu dhabi', 'kizad'],
  },
  {
    name: 'Sharjah Airport International Free Zone',
    label: 'Sharjah Airport International Free Zone (SAIF Zone)',
    emirate: 'Sharjah',
    aliases: ['saif zone', 'saif', 'sharjah airport international free zone'],
  },
  {
    name: 'Hamriyah Free Zone',
    label: 'Hamriyah Free Zone',
    emirate: 'Sharjah',
    aliases: ['hamriyah free zone', 'hamriyah', 'hfza'],
  },
];

/** Lower-case, strip diacritics, unify dashes/whitespace, drop punctuation except spaces. */
export function normaliseText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[‐-―−]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const ZONE_INDEX: ReadonlyMap<string, KnownZone> = (() => {
  const m = new Map<string, KnownZone>();
  for (const z of KNOWN_ZONES) {
    m.set(normaliseText(z.name), z);
    for (const a of z.aliases) m.set(normaliseText(a), z);
  }
  return m;
})();

/** Look up a known zone by canonical name or alias (case/punctuation-insensitive). */
export function findKnownZone(raw: string | undefined): KnownZone | undefined {
  if (!raw) return undefined;
  return ZONE_INDEX.get(normaliseText(raw));
}

/**
 * Map a raw zone string to its canonical KNOWN_ZONES name; unknown zones are
 * returned trimmed with whitespace collapsed (never dropped).
 */
export function normaliseZone(raw: string): string {
  const known = findKnownZone(raw);
  return known ? known.name : raw.trim().replace(/\s+/g, ' ');
}

const LEGAL_SUFFIXES = [
  'l l c',
  'llc',
  'fze',
  'fzco',
  'fz llc',
  'fzc',
  'pjsc',
  'psc',
  'p j s c',
  'ltd',
  'limited',
  'plc',
  'inc',
  'co',
  'company',
  'group',
  'holding',
  'holdings',
];

/**
 * Comparison key for a company name: normalised text with trailing legal
 * suffixes ("LLC", "PJSC", "Group", ...) removed. Use for matching only; the
 * display spelling stays as entered.
 */
export function companyKey(name: string): string {
  let k = normaliseText(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (k.endsWith(` ${suf}`) && k.length > suf.length + 1) {
        k = k.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return k;
}

/** Trim and collapse whitespace in a display company name. */
export function cleanCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Derive `companies` from developer / investor / owner / operator plus any
 * `extra` names, de-duplicated by `companyKey` (first spelling wins), in that
 * role order.
 */
export function deriveCompanies(
  p: Pick<Project, 'developer' | 'investor' | 'owner' | 'operator'>,
  extra: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [p.developer, p.investor, p.owner, p.operator, ...extra]) {
    if (!raw || !raw.trim()) continue;
    const key = companyKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleanCompanyName(raw));
  }
  return out;
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ocid|cmpid)$/i;

/**
 * Canonical form of a URL for comparison: lower-case scheme/host, no `www.`,
 * no fragment, no tracking parameters, no trailing slash. Returns the trimmed
 * input when it cannot be parsed.
 */
export function normaliseUrl(raw: string): string {
  const t = raw.trim();
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return t;
  }
  u.hash = '';
  const keep: [string, string][] = [];
  u.searchParams.forEach((v, k) => {
    if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
  });
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const port = u.port ? `:${u.port}` : '';
  let path = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '';
  return `${u.protocol.toLowerCase()}//${host}${port}${path}${qs ? `?${qs}` : ''}`;
}

/** True when `raw` parses as an absolute http(s) URL with a host. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0 && !/\s/.test(raw);
  } catch {
    return false;
  }
}

const NAME_STOPWORDS = new Set(['the', 'and', 'of', 'in', 'at', 'for', 'new', 'dubai', 'uae', 'llc', 'a']);

/** Token set of a project/facility name for similarity comparison. */
export function nameTokens(name: string): Set<string> {
  return new Set(
    normaliseText(name)
      .split(' ')
      .filter((t) => t.length > 0 && !NAME_STOPWORDS.has(t)),
  );
}

/** Jaccard similarity of two token sets (0..1). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
