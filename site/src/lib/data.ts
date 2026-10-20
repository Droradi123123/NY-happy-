/**
 * All site data, read once per build.
 *
 * Source: the Supabase views site_bars / site_parties / site_venues / nyc_hoods
 * (project zqfscuwkxcoktpjhaebv) with the PUBLIC publishable key. Row-level security
 * on the base tables decides what is public: live bars, published parties, active venues.
 * YAY_FIXTURE=1 builds from fixtures/ instead (local development without network).
 *
 * The scraped data is not shown as it comes: clean() drops what fails a check
 * (placeholder phone numbers, bottle prices read as deals, rounded coordinates, opening
 * hours that contradict the happy hour, duplicate listings). Nothing is invented: a
 * missing fact stays missing and the page says so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc'; // read-only, RLS-limited
const FIXTURE = process.env.YAY_FIXTURE === '1';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
export const DAY_NAME: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const DAY_SHORT: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

async function rest<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: PUBLIC_KEY, Range: `${from}-${from + 999}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok && r.status !== 206) throw new Error(`Supabase ${path}: HTTP ${r.status}`);
    const page = (await r.json()) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const fixture = <T>(f: string): T => JSON.parse(readFileSync(join(process.cwd(), 'fixtures', f), 'utf-8'));

// ---------- happy hours ----------

export interface Recheck { at: string; verdict: 'confirmed' | 'partial' | 'changed' | 'inconclusive' | 'unreachable'; found: string[] | null; missing: string[] | null; url: string }
interface RawBar {
  slug: string; name: string; category: string | null; tags: string[]; hood: string; hood_slug: string; borough: string | null;
  address: string | null; lat: number | null; lng: number | null; last_verified: string | null;
  hh: RawHH | null; hh_source: string | null; hh_checked: string | null;
  /** the latest re-read of the source page (db: bar_recheck_ingest): confirmed moves hh_checked */
  hh_recheck?: Recheck | null;
  subway: { lines: string[]; meters: number; station: string; walk_min: number; accessible?: boolean } | null;
  hours: Partial<Record<Day, string>> | null; phone: string | null; booking: string | null; instagram: string | null;
  price_range: string | null; cuisine: string | null; licence: string | null; website: string | null;
}
interface RawHH {
  days: Day[]; start: string | null; end: string | null; windows?: { days: Day[]; start: string | null; end: string | null }[];
  offers: { item: string; price: string; kind?: string }[]; has_food: boolean; two_for_one: boolean;
  drinks_discount: string | null; food_discount: string | null; deal_text?: string | null;
}

export interface Window { days: Day[]; start: string | null; end: string | null }
export interface Offer { item: string; price: string; kind: 'drink' | 'food'; dollars: number | null }
export interface Bar {
  slug: string; name: string; category: string; tags: string[];
  hood: string; hoodSlug: string; borough: string | null; address: string | null;
  lat: number | null; lng: number | null; onMap: boolean;
  windows: Window[]; days: Day[]; offers: Offer[];
  drinksDeal: string | null; foodDeal: string | null; twoForOne: boolean; hasFood: boolean;
  /** the source page was re-read and showed other prices (changed) or not all of ours (partial) */
  recheck: Recheck | null; doubt: 'changed' | 'partial' | null;
  cheapestDrink: number | null; oysters: boolean; late: boolean; allDay: boolean; weekend: boolean; early: boolean;
  subway: RawBar['subway']; hours: Partial<Record<Day, string>> | null;
  phone: string | null; booking: string | null; instagram: string | null; website: string | null;
  priceRange: string | null; cuisine: string | null; licence: string | null;
  source: string | null; checked: string | null; dealKnown: boolean;
}

const DRINK = /beer|draft|draught|pint|lager|ipa|wine|ros[eé]|prosecco|champagne|bubbles|cocktail|margarita|martini|negroni|spritz|mule|well|shot|spirit|vodka|tequila|mezcal|whiskey|whisky|bourbon|gin|rum|sake|soju|cider|seltzer|drink|mimosa|sangria|highball|old fashioned/i;
const OYSTER = /oyster/i;

/** "$6" -> 6, "$2 off" -> null (a discount, not a price), "50% off" -> null */
function dollars(p: string): number | null {
  if (/off|%/i.test(p)) return null;
  const m = p.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}
const plausible = (p: string) => { const d = dollars(p); return d === null ? /off|%/i.test(p) : d > 0 && d <= 40; };

function minutes(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** an opening-hours entry that cannot contain the happy hour is a scraping error: drop the hours */
function hoursAgree(hours: RawBar['hours'], windows: Window[]): boolean {
  if (!hours) return false;
  for (const w of windows) {
    const s = minutes(w.start);
    if (s === null) continue;
    for (const d of w.days) {
      const h = hours[d];
      if (!h) continue;
      const [o, c] = h.split('-').map(minutes);
      if (o === null || c === null) continue;
      const close = c <= o ? c + 1440 : c;
      if (s < o || s >= close) return false;
    }
  }
  return true;
}

function clean(b: RawBar): Bar | null {
  const hh = b.hh;
  if (!hh || !hh.days?.length) return null;
  const windows: Window[] = (hh.windows?.length ? hh.windows : [{ days: hh.days, start: hh.start, end: hh.end }])
    .map((w) => ({ days: DAYS.filter((d) => w.days.includes(d)), start: w.start === 'open' ? null : w.start, end: w.end }))
    .filter((w) => w.days.length);
  const days = DAYS.filter((d) => windows.some((w) => w.days.includes(d)));
  // a discount is never a price: the extractor's own kind (amount_off, percent, free) and the bar's
  // text ("$1 of all drinks", "$2 off drafts") both mark one; only plain prices rank as cheap drinks
  const text = hh.deal_text ?? '';
  const isDiscount = (o: { price: string; kind?: string }) => {
    if (o.kind && o.kind !== 'fixed') return true;
    const n = o.price.replace(/[^0-9.]/g, '');
    return n !== '' && new RegExp(`\\$\\s*${n.replace('.', '\\.')}(?!\\d)\\s*(off|of all|of each|of every|discount)\\b`, 'i').test(text);
  };
  const offers: Offer[] = (hh.offers ?? [])
    .filter((o) => o.item && o.price && plausible(o.price))
    .map((o) => {
      const off = isDiscount(o) && !/off|%|free/i.test(o.price);
      const price = off ? (o.kind === 'free' ? 'free' : `${o.price.trim()} off`) : o.price.trim();
      return { item: o.item.trim(), price, kind: DRINK.test(o.item) ? 'drink' as const : 'food' as const, dollars: off ? null : dollars(o.price) };
    });
  // a deal label is shown only when it says something ("$2 off", "half price"), never "yes" or "free item"
  const okDeal = (x: string | null) => (x && !/\$\s*\d{3,}/.test(x) && /\d|half|2-for-1|two for one|bogo/i.test(x) ? x : null);
  // a later re-read of the bar's page that did not find a price takes it out of "cheapest" rankings
  const recheck = b.hh_recheck ?? null;
  const doubt = recheck && (recheck.verdict === 'changed' || recheck.verdict === 'partial') ? recheck.verdict : null;
  const unconfirmed = new Set((recheck?.missing ?? []).map(Number));
  const drinkPrices = doubt === 'changed' ? [] : offers.filter((o) => o.kind === 'drink' && o.dollars !== null && !unconfirmed.has(o.dollars)).map((o) => o.dollars!);
  // rounded coordinates (two decimals or fewer) put the pin hundreds of meters off
  const precise = (n: number | null) => n !== null && (String(n).split('.')[1]?.length ?? 0) >= 4;
  const onMap = precise(b.lat) && precise(b.lng);
  const ends = windows.map((w) => minutes(w.end)).filter((x): x is number => x !== null);
  const starts = windows.map((w) => minutes(w.start)).filter((x): x is number => x !== null);
  const phone = b.phone && !/555-01\d\d/.test(b.phone) ? b.phone : null;
  const hours = hoursAgree(b.hours, windows) ? b.hours : null;
  const drinksDeal = okDeal(hh.drinks_discount), foodDeal = okDeal(hh.food_discount);
  return {
    slug: b.slug, name: b.name.trim(), category: b.category ?? 'bar', tags: b.tags ?? [],
    hood: b.hood, hoodSlug: b.hood_slug, borough: b.borough, address: b.address, lat: b.lat, lng: b.lng, onMap,
    windows, days, offers,
    drinksDeal, foodDeal, twoForOne: !!hh.two_for_one, hasFood: !!hh.has_food || !!foodDeal,
    cheapestDrink: drinkPrices.length ? Math.min(...drinkPrices) : null,
    oysters: offers.some((o) => OYSTER.test(o.item)) || b.tags?.includes('oysters'),
    late: ends.some((e) => e >= 21 * 60 || e < 5 * 60) || starts.some((s) => s >= 21 * 60) || windows.some((w) => w.end === null && (minutes(w.start) ?? 0) >= 20 * 60),
    allDay: b.tags?.includes('all-day') || windows.some((w) => w.start === null && w.end === null),
    weekend: days.includes('sat') || days.includes('sun'),
    early: starts.some((s) => s < 16 * 60),
    subway: b.subway?.station ? b.subway : null, hours,
    phone, // a widget or client link with no venue in it opens nothing useful
    booking: b.booking && !/widgets\.resy\.com\/?$|opentable\.com\/restref\/client\/?$/.test(b.booking) ? b.booking : null,
    instagram: b.instagram, website: b.website, priceRange: b.price_range, cuisine: b.cuisine, licence: b.licence,
    source: b.hh_source, checked: b.hh_checked ?? b.last_verified, recheck, doubt,
    dealKnown: offers.length > 0 || !!drinksDeal || !!foodDeal || !!hh.two_for_one,
  };
}

/** one listing per place: same spot (about 15 m) and same phone or address means the same bar */
function dedupe(bars: Bar[]): Bar[] {
  const score = (b: Bar) => b.offers.length * 3 + (b.dealKnown ? 5 : 0) + (b.hours ? 1 : 0) + (b.booking ? 1 : 0) + (b.address ? 1 : 0);
  const kept: Bar[] = [];
  for (const b of [...bars].sort((a, c) => score(c) - score(a))) {
    const twin = kept.find((k) => k.lat !== null && b.lat !== null && Math.abs(k.lat - b.lat) < 0.00015 && Math.abs((k.lng ?? 0) - (b.lng ?? 0)) < 0.00015
      && ((k.phone && k.phone === b.phone) || (k.website && b.website && host(k.website) === host(b.website))));
    if (!twin) kept.push(b);
  }
  return kept.sort((a, c) => a.name.localeCompare(c.name));
}
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

let _bars: Promise<Bar[]> | null = null;
export function allBars(): Promise<Bar[]> {
  _bars ??= (async () => {
    const raw = FIXTURE ? fixture<RawBar[]>('bars.json') : await rest<RawBar>('site_bars?select=*&order=slug');
    return dedupe(raw.map(clean).filter((b): b is Bar => b !== null));
  })();
  return _bars;
}

export interface Hood { name: string; slug: string; borough: string }
export async function allHoods(): Promise<Hood[]> {
  if (FIXTURE) {
    const bars = await allBars();
    const m = new Map(bars.map((b) => [b.hoodSlug, { name: b.hood, slug: b.hoodSlug, borough: b.borough ?? 'Manhattan' }]));
    return [...m.values()];
  }
  return rest<Hood>('nyc_hoods?select=*');
}

// ---------- times ----------

/** "17:00" -> "5pm", "17:30" -> "5:30pm", null -> null */
export function ampm(t: string | null): string | null {
  const m = minutes(t);
  if (m === null) return null;
  const h = Math.floor(m / 60) % 24, mm = m % 60, h12 = h % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}
export function windowLabel(w: Window): string {
  const s = ampm(w.start), e = ampm(w.end);
  if (!s && !e) return 'all day';
  if (!s) return `open to ${e}`;
  if (!e) return `${s} to close`;
  return `${s}–${e}`;
}
/** ["mon","tue","wed","thu","fri"] -> "Mon–Fri" */
export function daysLabel(days: Day[]): string {
  if (days.length === 7) return 'Daily';
  const idx = days.map((d) => DAYS.indexOf(d)).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const i of idx) { const r = runs[runs.length - 1]; if (r && i === r[r.length - 1] + 1) r.push(i); else runs.push([i]); }
  return runs.map((r) => (r.length > 2 ? `${DAY_SHORT[DAYS[r[0]]]}–${DAY_SHORT[DAYS[r[r.length - 1]]]}` : r.map((i) => DAY_SHORT[DAYS[i]]).join(', '))).join(', ');
}
export function scheduleLabel(b: Bar): string {
  return b.windows.map((w) => `${daysLabel(w.days)} ${windowLabel(w)}`).join(' · ');
}
/** the deal in a few words, only from what was read: "$6 drafts, wells and wine" or null */
export function dealLabel(b: Bar): string | null {
  if (b.twoForOne) return '2-for-1';
  const drinks = b.offers.filter((o) => o.kind === 'drink');
  if (drinks.length) {
    const prices = [...new Set(drinks.map((o) => o.price))];
    if (prices.length === 1) return `${prices[0]} ${drinks.slice(0, 3).map((o) => o.item.toLowerCase()).join(', ')}`;
    return drinks.slice(0, 2).map((o) => `${o.item} ${o.price}`).join(' · ');
  }
  if (b.drinksDeal) return `${b.drinksDeal} drinks`;
  const food = b.offers.filter((o) => o.kind === 'food');
  if (food.length) return food.slice(0, 2).map((o) => `${o.item} ${o.price}`).join(' · ');
  if (b.foodDeal) return `${b.foodDeal} food`;
  return null;
}
/** a bare date ("2026-10-14") is a New York calendar day, not UTC midnight */
export const fmtDate = (iso: string | null) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00-05:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : null);

/** when these bars' deals were last read on their own sites: "Sep 2, 2026" or "Sep 1 to Sep 3, 2026".
 *  Not the page's date: a rebuild or a new paragraph never makes a deal more recent. */
export function checkedRange(bars: Bar[]): string | null {
  const ds = bars.map((b) => b.checked?.slice(0, 10)).filter((d): d is string => !!d).sort();
  if (!ds.length) return null;
  const a = fmtDate(ds[0])!, z = fmtDate(ds[ds.length - 1])!;
  return a === z ? a : `${a.replace(/, \d{4}$/, ds[0].slice(0, 4) === ds[ds.length - 1].slice(0, 4) ? '' : '$&')} to ${z}`;
}

export const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- places to group by: subway stations and landmarks ----------

/** `shared`: another station has the same name (28th Street on the 1 and on the 6), so the page names its lines */
export interface Station { slug: string; name: string; lines: string[]; bars: Bar[]; shared: boolean }
export async function stations(min = 5): Promise<Station[]> {
  const m = new Map<string, Station>();
  for (const b of await allBars()) {
    if (!b.subway || b.subway.walk_min > 10) continue;
    const lines = [...b.subway.lines].sort();
    const key = slugify(`${b.subway.station} ${lines.join(' ')}`);
    const s = m.get(key) ?? { slug: key, name: b.subway.station, lines, bars: [], shared: false };
    s.bars.push(b);
    m.set(key, s);
  }
  // a station named after a landmark ("Grand Central") would compete with the landmark's page
  const marks = LANDMARKS.map((l) => slugify(l.name.replace(/^the /, '')));
  const out = [...m.values()].filter((s) => s.bars.length >= min && !marks.some((k) => slugify(s.name).startsWith(k)));
  const names = new Map<string, number>();
  for (const s of out) names.set(s.name, (names.get(s.name) ?? 0) + 1);
  for (const s of out) s.shared = (names.get(s.name) ?? 0) > 1;
  return out.sort((a, b) => b.bars.length - a.bars.length);
}

/** places tourists search from ("happy hour near Times Square"); coordinates from OpenStreetMap */
export const LANDMARKS = [
  { slug: 'times-square', name: 'Times Square', lat: 40.758, lng: -73.9855 },
  { slug: 'grand-central', name: 'Grand Central', lat: 40.7527, lng: -73.9772 },
  // short: how people search it ("happy hour near msg"), for titles that must fit in about 60 characters
  { slug: 'penn-station-msg', name: 'Penn Station and Madison Square Garden', short: 'Penn Station & MSG', lat: 40.7506, lng: -73.9935 },
  { slug: 'empire-state-building', name: 'the Empire State Building', lat: 40.7484, lng: -73.9857 },
  { slug: 'rockefeller-center', name: 'Rockefeller Center', lat: 40.7587, lng: -73.9787 },
  { slug: 'broadway-theater-district', name: 'the Broadway theaters', lat: 40.7590, lng: -73.9870 },
  { slug: 'bryant-park', name: 'Bryant Park', lat: 40.7536, lng: -73.9832 },
  { slug: 'union-square', name: 'Union Square', lat: 40.7359, lng: -73.9911 },
  { slug: 'high-line', name: 'the High Line', lat: 40.7480, lng: -74.0048 },
  { slug: 'hudson-yards', name: 'Hudson Yards', lat: 40.7539, lng: -74.0018 },
  { slug: 'world-trade-center', name: 'the World Trade Center', lat: 40.7127, lng: -74.0134 },
  { slug: 'brooklyn-bridge', name: 'the Brooklyn Bridge', lat: 40.7061, lng: -73.9969 },
  { slug: 'central-park-south', name: 'Central Park South', lat: 40.7655, lng: -73.9767 },
  { slug: 'barclays-center', name: 'Barclays Center', lat: 40.6826, lng: -73.9754 },
] as const;
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export async function landmarks(min = 5) {
  const bars = (await allBars()).filter((b) => b.onMap);
  return LANDMARKS.map((l) => ({
    ...l,
    bars: bars.map((b) => ({ b, m: meters(l, { lat: b.lat!, lng: b.lng! }) })).filter((x) => x.m <= 800).sort((x, y) => x.m - y.m),
  })).filter((l) => l.bars.length >= min);
}

// ---------- parties ----------

export interface Party {
  slug: string; title: string; starts_at: string; ends_at: string | null; doors_at: string | null; night_date: string;
  event_status: string; venue_id: string; room: string | null; borough: string | null; neighborhood: string | null;
  age_min: number | null; price_from: number | null; price_to: number | null; price_status: string;
  genres: string[]; themes: string[]; performers: string[]; organizer: string | null;
  ticket_url: string; ticket_vendor: string; refund_terms: string | null; last_checked: string | null;
  copy: { about?: string; expect?: string; music?: string; before_you_go?: string; faq?: { q: string; a: string }[]; refunds_by_seller?: Record<string, string> };
  extra: Record<string, unknown> | null; sources: { name: string; url: string; checked_at: string }[] | null;
}
export interface Venue { id: string; name: string; rooms: string[]; address: string | null; borough: string | null; neighborhood: string | null; lat: number | null; lng: number | null; kind: string | null; copy: Record<string, string>; extra?: Record<string, unknown> | null }

let _parties: Promise<{ parties: Party[]; venues: Venue[]; venuePages: Venue[] }> | null = null;
export function partyData() {
  _parties ??= (async () => {
    const { parties, venues } = FIXTURE
      ? fixture<{ parties: Party[]; venues: Venue[] }>('parties.json')
      : { parties: await rest<Party>('site_parties?select=*&order=starts_at'), venues: await rest<Venue>('site_venues?select=*') };
    // a night that is over is not built (the HappyTLV rule); the fixture keeps its nights for development
    const cutoff = FIXTURE ? 0 : Date.now() - 2 * 3600e3;
    const live = parties.filter((p) => new Date(p.ends_at ?? p.starts_at).getTime() > cutoff && p.event_status !== 'cancelled')
      // the NYE rule matches text ("NYE tickets on sale"); only the nights around New Year's Eve are NYE parties
      .map((p) => (p.themes.includes('nye') && !/-(12-3[01]|01-01)$/.test(p.night_date) ? { ...p, themes: p.themes.filter((t) => t !== 'nye') } : p));
    // a club keeps its page once it has had a published night, even between parties
    // (HappyTLV: two clubs lost 294 impressions while their pages were 404 between nights)
    const ever = new Set(parties.map((p) => p.venue_id));
    const venuePages = venues.filter((v) => ever.has(v.id));
    return { parties: live.sort((a, b) => a.starts_at.localeCompare(b.starts_at)), venues, venuePages };
  })();
  return _parties;
}
export const venueOf = (p: Party, venues: Venue[]) => venues.find((v) => v.id === p.venue_id) ?? null;
/** "Halloween Weekender: Apollonia,  + many more" -> tidy; "(Fri) SOLD OUT" stays out of titles */
export const cleanTitle = (t: string) => t.replace(/\s+SOLD OUT\s*$/i, '').replace(/,\s*\+/g, ' +').replace(/\s{2,}/g, ' ').trim();
export const nyTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(':00', '').replace(' ', '').toLowerCase() : null);
export const nyDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) => new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: 'America/New_York' });
export const nightDate = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('en-US', { ...opts, timeZone: 'America/New_York' });
export const priceLabel = (p: Party) => (p.price_status === 'free' ? 'Free' : p.price_from ? `From $${Math.round(p.price_from)}` : 'Price not listed');
export const GENRE_NAME: Record<string, string> = {
  techno: 'Techno', house: 'House', disco: 'Disco', trance: 'Trance', 'drum-and-bass': 'Drum & bass', breaks: 'Breaks', afrobeats: 'Afrobeats',
  amapiano: 'Amapiano', 'afro-house': 'Afro house', latin: 'Latin', reggaeton: 'Reggaeton', 'hip-hop': 'Hip-hop', 'r-and-b': 'R&B', dancehall: 'Dancehall',
  edm: 'EDM', pop: 'Pop', emo: 'Emo', '80s': "'80s", '90s': "'90s", '2000s': '2000s', 'k-pop': 'K-pop', jazz: 'Jazz', 'funk-soul': 'Funk & soul',
  experimental: 'Experimental', electro: 'Electro', garage: 'Garage',
};

// ---------- photos ----------

/** A freely licensed photo, self-hosted by scripts/fetch-images.mjs, with what its credit line needs. */
export interface Photo {
  kind: 'bar' | 'venue' | 'hood' | 'page'; key: string; src: string; thumb: string; w: number; h: number;
  /** 800px rendition for srcset; og: a 1200x630 JPEG share image (page photos only) */
  mid?: string; og?: string;
  title: string | null; author: string | null; authorUrl: string | null;
  license: string; licenseUrl: string | null; page: string; file: string;
  /** wikimedia_commons (free license, self-hosted) or google_places (Places API, attribution required, refreshed within 30 days) */
  source?: 'wikimedia_commons' | 'google_places';
  /** name / wikipedia_lead: the place itself; nearby: a street photo taken a few dozen meters away */
  match?: 'name' | 'wikipedia_lead' | 'nearby';
}
let photoCache: Map<string, Photo> | null = null;
export function photos(): Map<string, Photo> {
  if (!photoCache) {
    let list: Photo[] = [];
    try { list = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'images.json'), 'utf-8')); } catch { /* no photos yet */ }
    photoCache = new Map(list.map((p) => [`${p.kind}:${p.key}`, p]));
  }
  return photoCache;
}
export const photoOf = (kind: Photo['kind'], key: string | null | undefined) => (key ? photos().get(`${kind}:${key}`) ?? null : null);
/** "Jane Doe · CC BY-SA 4.0": what a thumbnail carries; the full credit is on the page and /image-credits */
/** card header without a photo: borough color + place name (CSS class xart-{slug}) */
export const boroughSlug = (b: string | null) => (b ? b.toLowerCase().replace(/^the /, '').replace(/\s+/g, '-') : 'nyc');
export const creditShort = (p: Photo) => (p.source === 'google_places' ? `${p.author ?? 'Photo'} · Google Maps` : `${p.author ?? 'Wikimedia Commons'} · ${p.license}`);

/**
 * The picture for a bar or venue, and what it shows: the place itself, the street outside it
 * (a free photo taken within ~70 m), or, failing both, its neighborhood. Never presented as more than it is.
 */
export type PhotoRel = 'own' | 'nearby' | 'hood';
export interface PlacePhoto { photo: Photo; rel: PhotoRel; hood: string | null }
export function placePhoto(kind: 'bar' | 'venue', key: string | null | undefined, hood: string | null, hoodSlug?: string | null, withHood = true): PlacePhoto | null {
  const own = photoOf(kind, key);
  if (own) return { photo: own, rel: own.match === 'nearby' ? 'nearby' : 'own', hood };
  // in a grid of cards the same neighborhood photo would repeat on every card: a designed card is better there
  if (!withHood) return null;
  const h = photoOf('hood', hoodSlug ?? (hood ? slugify(hood) : null));
  return h ? { photo: h, rel: 'hood', hood } : null;
}
/** the line that says what the picture shows, e.g. "The street outside Rangoon" */
export const photoNote = (pp: PlacePhoto, name: string) => (pp.rel === 'nearby' ? `The street outside ${name}` : pp.rel === 'hood' ? `${pp.hood ?? 'The neighborhood'}, around ${name}` : null);
/** card caption: what it shows + the credit */
export const cardCredit = (pp: PlacePhoto) => (pp.rel === 'nearby' ? `Street outside · ${creditShort(pp.photo)}` : pp.rel === 'hood' ? `${pp.hood ?? 'Neighborhood'} · ${creditShort(pp.photo)}` : creditShort(pp.photo));

// ---------- Google Places IDs ----------

/** the Google Maps Place ID matched to a bar or venue. Google's terms allow storing Place IDs (not hours, photos or other content) */
export interface GoogleInfo { subject_kind: 'bar' | 'venue'; subject_key: string; place_id: string }
let _google: Promise<Map<string, GoogleInfo>> | null = null;
export function googleInfo(): Promise<Map<string, GoogleInfo>> {
  _google ??= (async () => {
    if (FIXTURE) return new Map();
    try { return new Map((await rest<GoogleInfo>('site_google?select=subject_kind,subject_key,place_id')).map((g) => [`${g.subject_kind}:${g.subject_key}`, g])); } catch { return new Map(); }
  })();
  return _google;
}
/** a Google Maps link that opens the exact place (Maps URLs, no key needed) */
export const placeUrl = (name: string, placeId: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;

// ---------- editorial copy ----------

/** original copy for a page (prose only: prices and times are rendered from live data next to it) */
export interface PageCopy {
  kind: 'hood' | 'borough' | 'tag' | 'day' | 'bar' | 'venue' | 'near'; key: string; intro: string;
  picks: { slug: string; why: string }[]; sections: { h: string; body: string }[]; faq: { q: string; a: string }[]; written: string;
}
let _copy: Promise<Map<string, PageCopy>> | null = null;
export function pageCopies(): Promise<Map<string, PageCopy>> {
  _copy ??= (async () => {
    let rows: PageCopy[] = [];
    if (FIXTURE) { try { rows = fixture<PageCopy[]>('page_copy.json'); } catch { rows = []; } }
    else { try { rows = await rest<PageCopy>('site_page_copy?select=*'); } catch { rows = []; } }
    return new Map(rows.map((c) => [`${c.kind}:${c.key}`, c]));
  })();
  return _copy;
}
export const copyOf = async (kind: PageCopy['kind'], key: string) => (await pageCopies()).get(`${kind}:${key}`) ?? null;
export const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
/** about 230 words a minute */
export const readMinutes = (c: PageCopy) => Math.max(1, Math.round([c.intro, ...c.picks.map((p) => p.why), ...c.sections.map((s) => s.body), ...c.faq.map((f) => f.a)].join(' ').split(/\s+/).length / 230));

// ---------- blog posts written into the database ----------

export interface BlogPostRow {
  slug: string; status: 'published'; published: string; updated: string; title: string; h1: string; short: string; keyword: string;
  description: string; answer: string; intro: string; picks: { slug: string; why: string }[]; route: boolean;
  sections: { h: string; body: string }[]; faq: { q: string; a: string }[]; table_id: string | null; table_title: string | null;
  min_rows: number | null; method: string; related: [string, string][];
}
let _posts: Promise<BlogPostRow[]> | null = null;
export function blogPosts(): Promise<BlogPostRow[]> {
  _posts ??= (async () => {
    if (FIXTURE) { try { return fixture<BlogPostRow[]>('blog_posts.json'); } catch { return []; } }
    try { return await rest<BlogPostRow>('site_blog_posts?select=*'); } catch { return []; }
  })();
  return _posts;
}

// ---------- price re-checks ----------

/** the latest re-check of a bar's own happy-hour page: did the prices we hold still appear there? */
export interface Recheck { slug: string; verdict: 'confirmed' | 'not_found' | 'unreachable'; found: string[] | null; checked: string }
let _rechecks: Promise<Map<string, Recheck>> | null = null;
export function rechecks(): Promise<Map<string, Recheck>> {
  _rechecks ??= (async () => {
    if (FIXTURE) return new Map();
    try { return new Map((await rest<Recheck>('site_bar_rechecks?select=*')).map((r) => [r.slug, r])); } catch { return new Map(); }
  })();
  return _rechecks;
}
