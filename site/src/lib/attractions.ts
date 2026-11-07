/**
 * NYC attractions (docs/ATTRACTIONS.md). src/data/nyc_attractions.json is the single source of truth;
 * categories, boroughs and counts are derived from it, never hardcoded.
 *
 * Which records get a page:
 *  - approved ids (src/data/attractions-approved.json, written by scripts/attractions-approve.mjs),
 *    each with the record as it was when approved (snapshot);
 *  - plus, in a local review build only (YAY_ATTR_PREVIEW=1), every launch_candidate = "yes" record.
 * A production build with no approvals renders no attraction pages, no links and no sitemap entries.
 *
 * A data drop never removes or noindexes an approved page: when the current record is missing or no
 * longer a launch candidate, the page keeps the approved snapshot, shows a "being re-verified" note,
 * and the record goes on the review queue (reviewQueue(), printed by scripts/attractions-report.mjs).
 */
import data from '../data/nyc_attractions.json';
import approvalsFile from '../data/attractions-approved.json';
import { allBars, type Bar } from './data';
import { parseHours, type HoursSegment } from './attractionHours';

export interface AttractionRecord {
  id: string; name: string; category: string; borough: string; neighborhood: string;
  address: string; address_source: string; phone: string; phone_source: string;
  hours_recurring: string; hours_recurring_source: string; hours_observed: string; hours_observed_source: string;
  price_summary: string; price_source: string; price_flag: string;
  official_url: string; ticket_url: string; lat: number | string; lon: number | string; coords_source: string;
  description: string; description_source: string; record_tier: string; launch_candidate: string;
  indoor_outdoor: string; indoor_outdoor_basis: string; booking_required: string; booking_source: string;
  good_for_kids: string; typical_visit_duration: string; accessibility: string; accessibility_source: string; source_urls: string; verified_at: string; notes: string;
}
interface Approval { approved_at: string; snapshot: AttractionRecord }

export interface Attraction extends AttractionRecord {
  slug: string; catSlug: string; catLabel: string; path: string;
  /** approved page whose current data is missing or no longer a candidate: shows the snapshot */
  stale: boolean; approved: boolean;
  /** coordinates usable for a map (present and inside the five boroughs' box) */
  geo: { lat: number; lng: number } | null;
  /** day-by-day opening times parsed strictly from hours_recurring (lib/attractionHours.ts); null = no open/closed claim */
  hours: HoursSegment[] | null;
}

export const RECORDS = data.records as AttractionRecord[];
export const META = data.metadata;
const APPROVED = (approvalsFile as { approved: Record<string, Approval> }).approved ?? {};
export const PREVIEW = process.env.YAY_ATTR_PREVIEW === '1';

export const slugify = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** "Museums - Art" -> "Museums: Art" (the data's own words, readable in a title) */
export const catLabel = (c: string) => c.replace(/\s+-\s+/g, ': ');
const BOX = { s: 40.49, n: 40.92, w: -74.27, e: -73.68 };
const geoOf = (r: AttractionRecord) => {
  const lat = typeof r.lat === 'number' ? r.lat : NaN, lng = typeof r.lon === 'number' ? r.lon : NaN;
  return lat >= BOX.s && lat <= BOX.n && lng >= BOX.w && lng <= BOX.e ? { lat, lng } : null;
};
const healthy = (r: AttractionRecord | undefined): r is AttractionRecord => !!r && r.launch_candidate === 'yes';
const decorate = (r: AttractionRecord, stale: boolean, approved: boolean): Attraction => ({
  ...r, slug: r.id, catSlug: slugify(r.category), catLabel: catLabel(r.category), path: `/attractions/${r.id}`, stale, approved, geo: geoOf(r), hours: parseHours(r.hours_recurring),
});

let _all: Attraction[] | null = null;
/** the attraction pages this build renders, in data-file order (the stable default sort) */
export function attractions(): Attraction[] {
  if (_all) return _all;
  const byId = new Map(RECORDS.map((r) => [r.id, r]));
  const out = new Map<string, Attraction>();
  for (const [id, a] of Object.entries(APPROVED)) {
    const cur = byId.get(id);
    out.set(id, healthy(cur) ? decorate(cur, false, true) : decorate(a.snapshot, true, true));
  }
  if (PREVIEW) for (const r of RECORDS) if (healthy(r) && !out.has(r.id)) out.set(r.id, decorate(r, false, false));
  const order = new Map(RECORDS.map((r, i) => [r.id, i]));
  _all = [...out.values()].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  // a category page and a detail page must never share a URL
  const cats = new Set(_all.map((a) => a.catSlug));
  const clash = _all.find((a) => cats.has(a.id));
  if (clash) throw new Error(`attractions: id "${clash.id}" collides with a category slug`);
  return _all;
}
/** nonempty categories among rendered pages, in data-file order, with their members */
export function attractionCategories() {
  const m = new Map<string, { slug: string; name: string; label: string; items: Attraction[] }>();
  for (const a of attractions()) {
    if (!m.has(a.catSlug)) m.set(a.catSlug, { slug: a.catSlug, name: a.category, label: a.catLabel, items: [] });
    m.get(a.catSlug)!.items.push(a);
  }
  return [...m.values()];
}
/** approved pages that need a human look: data missing, no longer a candidate, or facts changed since approval */
export function reviewQueue(): { id: string; reason: string }[] {
  const byId = new Map(RECORDS.map((r) => [r.id, r]));
  const q: { id: string; reason: string }[] = [];
  for (const [id, a] of Object.entries(APPROVED)) {
    const cur = byId.get(id);
    if (!cur) q.push({ id, reason: 'missing from the current data drop: page shows the approved snapshot' });
    else if (cur.launch_candidate !== 'yes') q.push({ id, reason: `no longer a launch candidate (tier ${cur.record_tier}): page shows the approved snapshot` });
    else if (JSON.stringify(cur) !== JSON.stringify(a.snapshot)) q.push({ id, reason: 'facts changed since approval: page shows the new data, re-review it' });
  }
  return q;
}
export const lastChecked = () => attractions().reduce((m, a) => (a.verified_at > m ? a.verified_at : m), '');

/** "Midtown, Manhattan"; just the borough when the neighborhood repeats it ("New York Harbor (Manhattan)") */
export const placeLabel = (a: AttractionRecord) => (!a.neighborhood || a.borough.startsWith(a.neighborhood) ? a.borough : `${a.neighborhood}, ${a.borough}`);
/** the price as a card shows it: Free / the summary / Public space / See official site */
export function priceFlagLabel(a: AttractionRecord): string {
  if (a.price_flag === 'free') return 'Free';
  if (a.price_summary) return a.price_summary;
  if (a.price_flag === 'public-space') return 'Public space';
  return 'See official site';
}
/** an observed snapshot without its own redundant date ("10 AM-10 PM on 2026-11-07" checked 2026-11-07) */
export const observedText = (a: AttractionRecord) => {
  const d = a.verified_at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return a.hours_observed.replace(new RegExp(`^Observed ${d}:\\s*`), '').replace(new RegExp(`\\s+on ${d}(?=;|$)`), '').trim();
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** up to 3 happy hours whose neighborhood is one of the attraction's (a clean name join, no guessing) */
export async function happyHoursFor(a: Attraction): Promise<Bar[]> {
  const parts = new Set(a.neighborhood.split(/[,/]/).map(norm).filter(Boolean));
  if (!parts.size) return [];
  return (await allBars())
    .filter((b) => parts.has(norm(b.hood)) && b.dealKnown && !b.doubt)
    .sort((x, y) => (y.checked ?? '').localeCompare(x.checked ?? '') || x.name.localeCompare(y.name))
    .slice(0, 3);
}
