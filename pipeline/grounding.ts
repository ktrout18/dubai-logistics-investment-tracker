/**
 * The anti-fabrication gate. Pure code, no model calls.
 *
 * For each candidate fact:
 *  - every quote must occur in the fetched text (whitespace/quote-mark normalised);
 *  - every number or date in a claim must occur in that claim's quote;
 *  - the document URL must be one we fetched (direct) or a search backend returned (indexed);
 *  - named companies must occur in the text;
 *  - area bases are checked against the quote's wording (land/yard/district never
 *    become warehouse floor space); areas convert to m² with shared/units.ts;
 *  - forecast language never yields an actual completion.
 * Any failure means the fact is not publishable (it is held for review).
 */
import {
  KNOWN_ZONES,
  normaliseText,
  normaliseUrl,
  periodStart,
  toSquareMetres,
  roundTo,
  type AreaBasis,
  type AreaUnit,
  type DatePrecision,
  type Emirate,
} from '../shared/index.ts';
import type { CandidateFact } from './extraction.ts';
import type { DocumentRecord } from './types.ts';
import { normaliseWhitespace } from './html.ts';
import { findDates } from './dates.ts';

export interface GroundedArea {
  value: number;
  unit: AreaUnit;
  valueM2: number;
  basis: AreaBasis;
  quote: string;
  note?: string;
}

export interface GroundedFact {
  fact: CandidateFact;
  /** Event date actually used and where it came from. */
  eventDate?: { date: string; precision: DatePrecision; from: 'quote' | 'publication_date'; quote?: string };
  areas: GroundedArea[];
  /** Completion moved to forecast because of forecast language / future date. */
  forecastCompletion?: { date: string; precision: DatePrecision; quote: string };
  actualCompletion?: { date: string; precision: DatePrecision; quote: string };
  gradeAQuote?: string;
  /** True when the text mentions area-like figures that the extraction did not return. */
  textHasUnextractedArea: boolean;
}

export interface GroundingResult {
  ok: boolean;
  failures: string[];
  notes: string[];
  grounded: GroundedFact;
}

const norm = (s: string) => normaliseWhitespace(s).toLowerCase();

/** Quote occurs in text; "..." / "…" split a quote into parts that must appear in order. */
export function quoteInText(quote: string, text: string): boolean {
  const q = norm(quote);
  if (q.length < 3) return false;
  const t = norm(text);
  const parts = q.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length > 0);
  let from = 0;
  for (const p of parts) {
    const i = t.indexOf(p, from);
    if (i < 0) return false;
    from = i + p.length;
  }
  return true;
}

const MULT: Record<string, number> = {
  thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, mln: 1e6, billion: 1e9, bn: 1e9, b: 1e9,
};

/** Numbers stated in text, both as written and with million/billion multipliers applied. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(thousand|million|billion|mln|mn|bn|m|b|k)?\b/g)) {
    const v = Number(m[1]);
    if (!Number.isFinite(v)) continue;
    out.push(v);
    const mult = m[2] ? MULT[m[2]] : undefined;
    if (mult) out.push(v * mult);
  }
  return out;
}

export function quoteHasNumber(quote: string, value: number): boolean {
  return numbersIn(quote).some((n) => Math.abs(n - value) <= Math.max(1e-9, Math.abs(value) * 1e-9));
}

/** The quote states this date at this precision (or a coarser claim covered by a finer mention). */
export function quoteHasDate(quote: string, date: string, precision: DatePrecision): boolean {
  const target = periodStart(date, precision);
  return findDates(quote).some((m) => m.precision === precision && periodStart(m.date, precision) === target);
}

const UNIT_RE: Record<AreaUnit, RegExp> = {
  // "square-metre" / "square-foot" (hyphenated adjectives: "a 37,000-square-metre facility") count too.
  sqm: /\b(sq\.?\s?m|sqm|square[\s-]met(re|er)s?|m2|m²|sq\.? metres?)\b|m²/i,
  sqft: /\b(sq\.?\s?ft|sqft|square[\s-]f(ee|oo)t|sf)\b/i,
  hectare: /\b(hectares?|ha)\b/i,
  acre: /\bacres?\b/i,
};

const LAND_RE = /\b(land|plot|site|yard|district|masterplan|master-plan|campus|spread (over|across)|spanning|covers? an area|area of land|zone)\b/i;
const YARD_RE = /\b(open yard|yard|open storage|laydown)\b/i;
const DISTRICT_RE = /\b(district|masterplan|master-plan|city|zone|cluster)\b/i;
const FLOOR_RE = /\b(warehous\w*|floor|built-up|built up|gfa|gla|leasable|storage space|storage area|facility spans|facility covers|building)\b/i;

/** Coerce an extracted basis so land/yard/district wording can never become warehouse floor area. */
export function checkAreaBasis(basis: AreaBasis, unit: AreaUnit, quote: string): { basis: AreaBasis; note?: string; ambiguous?: boolean } {
  const floorClaim = basis === 'warehouse_gfa' || basis === 'gla' || basis === 'mixed_building_area';
  if (!floorClaim) return { basis };
  if (unit === 'hectare' || unit === 'acre') {
    return { basis: 'site_land_area', note: `basis ${basis} rejected: ${unit} figures are land areas` };
  }
  if (YARD_RE.test(quote)) return { basis: 'open_yard', note: `basis ${basis} rejected: quote describes a yard` };
  const land = LAND_RE.test(quote);
  const floor = FLOOR_RE.test(quote);
  if (land && !floor) {
    const b: AreaBasis = DISTRICT_RE.test(quote) && !/\b(plot|land|site)\b/i.test(quote) ? 'district_area' : 'site_land_area';
    return { basis: b, note: `basis ${basis} rejected: quote describes land/district, not floor space` };
  }
  if (!floor) return { basis: 'unspecified', note: `basis ${basis} not supported by the quote wording` };
  if (land && floor) return { basis, ambiguous: true, note: 'quote mentions both land and floor wording' };
  return { basis };
}

const FORECAST_RE = /\b(expected|scheduled|set to|will|due|slated|planned|plans?|target(ed|ing)?|anticipated|aims?|by (the )?end of|is to be|to be (completed|operational|opened)|upon completion|estimated)\b/i;

/** Narrower: wording that makes a reported opening/completion a future event. */
const PLANNED_EVENT_RE = /\b(expected to|scheduled to|set to|slated to|due to (open|be)|planned|plans to|will (open|be (completed|operational|inaugurated|ready))|is to (open|be)|to be (completed|operational|opened|inaugurated)|upon completion)\b/i;

const AREA_MENTION_RE = /\d[\d,.]*[\s-]*(million[\s-]+)?(sq\.?\s?ft|sqft|square[\s-]f(ee|oo)t|sq\.?\s?m|sqm|square[\s-]met(re|er)s?|m2|m²|hectares?|acres?)/i;

export function emirateSupported(emirate: Emirate, quote: string): boolean {
  const q = normaliseText(quote);
  if (q.includes(normaliseText(emirate))) return true;
  return KNOWN_ZONES.some(
    (z) => z.emirate === emirate && [z.name, ...z.aliases].some((a) => new RegExp(`\\b${normaliseText(a)}\\b`).test(q)),
  );
}

const CURRENCY_TOKENS: Record<string, RegExp> = {
  AED: /\b(aed|dhs?|dirhams?)\b|dh\d/i,
  USD: /\b(usd|us\$|dollars?)\b|\$/i,
  EUR: /\b(eur|euros?)\b|€/i,
  GBP: /\b(gbp|pounds?)\b|£/i,
  SAR: /\b(sar|riyals?)\b/i,
};

export interface GroundingContext {
  /** URLs fetched this run or returned by a search backend (normalised). */
  knownUrls: ReadonlySet<string>;
  today: string;
}

export function groundFact(fact: CandidateFact, doc: DocumentRecord, ctx: GroundingContext): GroundingResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const text = `${doc.title}\n${doc.text}`;
  const needQuote = (label: string, quote: string | null | undefined) => {
    if (!quote) {
      failures.push(`${label}: no supporting quote`);
      return false;
    }
    if (!quoteInText(quote, text)) {
      failures.push(`${label}: quote not found in the page text ("${quote.slice(0, 120)}")`);
      return false;
    }
    return true;
  };

  if (!ctx.knownUrls.has(normaliseUrl(doc.url))) failures.push(`URL ${doc.url} was neither fetched nor returned by search this run`);

  // Parties
  needQuote('parties', fact.partiesQuote);
  const tnorm = normaliseText(text);
  for (const [role, name] of [['developer', fact.developer], ['operator', fact.operator], ['investor', fact.investor], ['owner', fact.owner]] as const) {
    if (name && !tnorm.includes(normaliseText(name))) failures.push(`${role} "${name}" does not appear in the text`);
  }

  // Milestone
  needQuote('event', fact.eventQuote);
  const completionType = ['construction_completed', 'commissioned', 'opened'].includes(fact.eventType);
  if (completionType && (fact.eventIsPlannedOrFuture || PLANNED_EVENT_RE.test(fact.eventQuote))) {
    failures.push(`event ${fact.eventType} is described as planned/expected, not as having happened`);
  }
  let eventDate: GroundedFact['eventDate'];
  if (fact.eventDate) {
    if (needQuote('event date', fact.eventDate.quote)) {
      if (!quoteHasDate(fact.eventDate.quote, fact.eventDate.date, fact.eventDate.precision)) {
        failures.push(`event date ${fact.eventDate.date} (${fact.eventDate.precision}) is not stated in its quote`);
      } else {
        eventDate = { date: periodStart(fact.eventDate.date, fact.eventDate.precision), precision: fact.eventDate.precision, from: 'quote', quote: fact.eventDate.quote };
      }
    }
  } else if (doc.publishedDate) {
    eventDate = { date: doc.publishedDate, precision: 'day', from: 'publication_date' };
    notes.push(`event date taken from the source's publication date ${doc.publishedDate}`);
  } else {
    failures.push('no event date: neither stated in the text nor available as a publication date');
  }
  if (eventDate && eventDate.date > ctx.today) failures.push(`event date ${eventDate.date} is in the future`);

  // Location
  if (fact.emirate) {
    if (needQuote('emirate', fact.emirateQuote) && fact.emirateQuote && !emirateSupported(fact.emirate, fact.emirateQuote)) {
      failures.push(`emirate ${fact.emirate} is not named (directly or via a known zone) in its quote`);
    }
  }
  if (fact.locationQuote) needQuote('location', fact.locationQuote);
  if (fact.zone && !tnorm.includes(normaliseText(fact.zone))) failures.push(`zone "${fact.zone}" does not appear in the text`);

  // Areas
  const areas: GroundedArea[] = [];
  for (const [i, a] of fact.areas.entries()) {
    const label = `area[${i}]`;
    if (!needQuote(label, a.quote)) continue;
    if (!quoteHasNumber(a.quote, a.value)) {
      failures.push(`${label}: value ${a.value} is not stated in its quote`);
      continue;
    }
    if (!UNIT_RE[a.unit].test(a.quote)) {
      failures.push(`${label}: unit ${a.unit} is not stated in its quote`);
      continue;
    }
    const b = checkAreaBasis(a.basis, a.unit, a.quote);
    if (b.ambiguous) failures.push(`${label}: basis ambiguous (${b.note})`);
    if (b.note) notes.push(`${label}: ${b.note}`);
    areas.push({ value: a.value, unit: a.unit, valueM2: roundTo(toSquareMetres(a.value, a.unit), 2), basis: b.basis, quote: a.quote, ...(b.note ? { note: b.note } : {}) });
  }

  // Investment
  if (fact.investment) {
    const inv = fact.investment;
    if (needQuote('investment', inv.quote)) {
      if (!quoteHasNumber(inv.quote, inv.amount)) failures.push(`investment amount ${inv.amount} is not stated in its quote`);
      const cur = CURRENCY_TOKENS[inv.currency.toUpperCase()];
      if (!cur) failures.push(`investment currency ${inv.currency} is not one the pipeline can verify`);
      else if (!cur.test(inv.quote)) failures.push(`investment currency ${inv.currency} is not stated in its quote`);
    }
  }

  // Grade A
  let gradeAQuote: string | undefined;
  if (fact.gradeAQuote) {
    if (needQuote('grade A', fact.gradeAQuote)) {
      if (/grade[\s-]?a\b/i.test(fact.gradeAQuote)) gradeAQuote = fact.gradeAQuote;
      else failures.push('grade A quote does not contain "Grade A" wording');
    }
  }

  // Completion dates: a forecast never becomes actual.
  let forecastCompletion: GroundedFact['forecastCompletion'];
  let actualCompletion: GroundedFact['actualCompletion'];
  if (fact.forecastCompletion && needQuote('forecast completion', fact.forecastCompletion.quote)) {
    const f = fact.forecastCompletion;
    if (quoteHasDate(f.quote, f.date, f.precision)) forecastCompletion = { date: periodStart(f.date, f.precision), precision: f.precision, quote: f.quote };
    else failures.push(`forecast completion ${f.date} is not stated in its quote`);
  }
  if (fact.actualCompletion && needQuote('actual completion', fact.actualCompletion.quote)) {
    const a = fact.actualCompletion;
    const date = periodStart(a.date, a.precision);
    if (!quoteHasDate(a.quote, a.date, a.precision)) {
      failures.push(`actual completion ${a.date} is not stated in its quote`);
    } else if (FORECAST_RE.test(a.quote) || date > ctx.today || (doc.publishedDate && date > doc.publishedDate)) {
      notes.push(`completion date ${a.date} treated as a forecast (forecast wording or future date in "${a.quote.slice(0, 80)}")`);
      forecastCompletion ??= { date, precision: a.precision, quote: a.quote };
    } else if (!completionType) {
      notes.push(`completion date ${a.date} ignored: the reported milestone is ${fact.eventType}, not a completion/opening`);
    } else {
      actualCompletion = { date, precision: a.precision, quote: a.quote };
    }
  }

  const textHasUnextractedArea = areas.length === 0 && AREA_MENTION_RE.test(text);

  return {
    ok: failures.length === 0,
    failures,
    notes,
    grounded: {
      fact,
      ...(eventDate ? { eventDate } : {}),
      areas,
      ...(forecastCompletion ? { forecastCompletion } : {}),
      ...(actualCompletion ? { actualCompletion } : {}),
      ...(gradeAQuote ? { gradeAQuote } : {}),
      textHasUnextractedArea,
    },
  };
}
