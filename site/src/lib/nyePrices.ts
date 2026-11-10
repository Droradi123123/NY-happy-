/**
 * The NYC New Year's Eve Price Index (/nyc-nye-price-index): what a New Year's Eve party costs in NYC,
 * computed at build from the cheapest ticket listed for every NYE night we publish, plus the daily price
 * watch (party_price_snapshots, from Nov 9, 2026) and last season's holidays (site_holiday_history).
 * Every figure is a count, a median or a change of listed prices; nothing is estimated.
 */
import { partyData, priceSnapshots, holidayHistory, venueOf, type Party } from './data';
import { partyTags } from './index';

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (xs: number[], f: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]; };
export const usd = (x: number | null) => (x === null ? 'n/a' : `$${Math.round(x)}`);

export interface Group { label: string; slug?: string; n: number; median: number | null; from: number | null }
export interface NyePrices {
  built: string; date: string; nights: Party[]; priced: number; free: number; soldOut: number;
  median: number | null; p25: number | null; p75: number | null; min: number | null; max: number | null;
  under50: number; under100: number; over200: number;
  boroughs: Group[]; kinds: Group[]; cheapest: Party[];
  watch: { since: string | null; days: number; tracked: number; up: number; down: number; same: number; medianChangePct: number | null; newSoldOut: number };
  halloween: { nights: number; median: number | null; soldOutPct: number | null } | null;
  hist: { from: number; to: number; n: number }[];
}

let cache: Promise<NyePrices> | null = null;
export function nyePrices(): Promise<NyePrices> {
  cache ??= (async () => {
    const { parties, venues } = await partyData();
    const nights = parties.filter((p) => p.themes.includes('nye'));
    const priceOf = (p: Party) => (p.price_status === 'free' ? 0 : p.price_from !== null && p.price_from > 0 ? p.price_from : null);
    // a $0 lowest offer next to paid tickets is an RSVP or deposit ticket type, not an entry price: left out (Nov 10)
    const priced = nights.filter((p) => p.price_status !== 'free' && p.price_from !== null && p.price_from > 0);
    const xs = priced.map((p) => p.price_from!);
    const group = (label: string, list: Party[], slug?: string): Group => {
      const ys = list.filter((p) => p.price_status !== 'free' && p.price_from !== null && p.price_from > 0).map((p) => p.price_from!);
      // a median needs at least 3 priced nights to mean anything
      return { label, slug, n: list.length, median: ys.length >= 3 ? median(ys) : null, from: ys.length ? Math.min(...ys) : null };
    };
    const boroughs = ['Manhattan', 'Brooklyn', 'Queens', 'The Bronx', 'Staten Island']
      .map((b) => group(b, nights.filter((p) => p.borough === b), `new-years-eve/${b.toLowerCase()}`)).filter((g) => g.n >= 3);
    const tagged = (t: string) => nights.filter((p) => partyTags(p, venueOf(p, venues)).includes(t));
    const kinds = [group('Open bar', tagged('openbar'), 'new-years-eve/open-bar'), group('Rooftop', tagged('rooftop'), 'new-years-eve/rooftop'), group('Boat and yacht', tagged('boat'), 'new-years-eve/boat'),
      group('Clubs and everything else', nights.filter((p) => !partyTags(p, venueOf(p, venues)).some((t) => ['openbar', 'rooftop', 'boat'].includes(t))))].filter((g) => g.n >= 3);
    const cheapest = [...priced].filter((p) => p.event_status !== 'sold_out').sort((a, b) => a.price_from! - b.price_from!).slice(0, 8);

    // the price watch: each night's first snapshot against its latest one
    const ids = new Set(nights.map((p) => p.id));
    const snaps = (await priceSnapshots()).filter((s) => ids.has(s.event_id));
    const days = [...new Set(snaps.map((s) => s.day))].sort();
    const byEvent = new Map<string, typeof snaps>();
    for (const s of snaps) byEvent.set(s.event_id, [...(byEvent.get(s.event_id) ?? []), s]);
    let up = 0, down = 0, same = 0, newSoldOut = 0; const changes: number[] = [];
    for (const list of byEvent.values()) {
      const a = list[0], b = list[list.length - 1];
      if (a.day === b.day) continue;
      if (a.event_status !== 'sold_out' && b.event_status === 'sold_out') newSoldOut++;
      if (a.price_from === null || b.price_from === null || a.price_from <= 0) continue;
      if (b.price_from > a.price_from + 0.5) up++; else if (b.price_from < a.price_from - 0.5) down++; else same++;
      changes.push(((b.price_from - a.price_from) / a.price_from) * 100);
    }
    const h = (await holidayHistory()).find((x) => x.theme === 'halloween');
    const edges = [0, 25, 50, 75, 100, 150, 200, Infinity];
    return {
      built: new Date().toISOString().slice(0, 10), date: `${new Date().getFullYear()}-12-31`, nights, priced: priced.length,
      free: nights.filter((p) => p.price_status === 'free').length, soldOut: nights.filter((p) => p.event_status === 'sold_out').length,
      median: median(xs), p25: q(xs, 0.25), p75: q(xs, 0.75), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null,
      under50: nights.filter((p) => (priceOf(p) ?? Infinity) <= 50).length, under100: nights.filter((p) => (priceOf(p) ?? Infinity) <= 100).length,
      over200: priced.filter((p) => p.price_from! > 200).length,
      boroughs, kinds, cheapest,
      watch: { since: days[0] ?? null, days: days.length, tracked: changes.length, up, down, same, medianChangePct: median(changes), newSoldOut },
      halloween: h && h.nights >= 20 ? { nights: h.nights, median: h.median_price, soldOutPct: Math.round((h.sold_out / h.nights) * 100) } : null,
      hist: edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1], n: xs.filter((x) => x > from && x <= edges[i + 1]).length + (from === 0 ? xs.filter((x) => x === 0).length : 0) })),
    };
  })();
  return cache;
}
