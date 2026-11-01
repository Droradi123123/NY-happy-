/**
 * The NYC party calendar: every moment coming up in the next four months that people plan a night around,
 * so each one has its pages ready before people search for it (Halloween 2026: the date and borough pages
 * were the most visited of the season, mostly from ChatGPT).
 *   - holidays: the dates are computed in lib/partyLists.ts (Thanksgiving Eve, New Year's Eve, Super Bowl...)
 *   - seasons without a fixed date on our side (Friendsgiving, Hanukkah, SantaCon, Diwali): from the nights listed
 *   - big nights: the multi-night festivals, passes and headline nights in the data
 * Every count is the number of nights on sale on the site; nothing is announced before a seller lists it.
 */
import { partyData, venueOf, cleanTitle, type Party } from './data';
import { partyLists, datePages } from './partyLists';
import proof from '../data/proof.json';

export interface NycEvent {
  slug: string; name: string; kind: 'holiday' | 'season' | 'big';
  /** the night (holidays) or the first and last listed nights (seasons, big nights) */
  date: string; end: string | null;
  href: string | null; nights: Party[]; note: string;
  /** /parties/date/<date> exists for it */
  datePage: boolean;
}

const nyDay = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
const pr = (proof.pages ?? {}) as Record<string, { views28?: number; tickets28?: number }>;
const score = (p: Party) => { const x = pr[`/parties/${p.slug}`] ?? {}; return (x.tickets28 ?? 0) * 10 + (x.views28 ?? 0); };
// a festival, a multi-night pass or a headline show: what the sellers call it, or the size of the bill
const BIG = /festival|\bfest\b|time warp|circoloco|\bpass\b|open[- ]to[- ]close|all night long|day ?& ?night|takeover|weekender/i;

let cache: Promise<NycEvent[]> | null = null;
export function nycEvents(): Promise<NycEvent[]> {
  cache ??= (async () => {
    const today = nyDay(), until = nyDay(120);
    const { parties, venues } = await partyData();
    const lists = await partyLists();
    const dates = new Set((await datePages()).filter((d) => !d.past).map((d) => d.date));
    const out: NycEvent[] = [];
    for (const l of lists.filter((x) => x.kind === 'holiday' && x.holiday)) {
      const d = l.holiday!.date;
      if (d < today || d > until) continue;
      out.push({ slug: l.slug, name: l.holiday!.name, kind: 'holiday', date: d, end: null, href: `/parties/${l.slug}`, nights: l.parties, note: l.holiday!.note, datePage: dates.has(d) });
    }
    for (const l of lists.filter((x) => x.kind === 'season' && x.parties.length)) {
      const ns = l.parties.filter((p) => p.night_date >= today && p.night_date <= until);
      if (!ns.length) continue;
      out.push({ slug: l.slug, name: l.short, kind: 'season', date: ns[0].night_date, end: ns[ns.length - 1].night_date, href: `/parties/${l.slug}`, nights: ns, note: '', datePage: false });
    }
    // big nights: grouped by the event's own name (a festival's Friday and Saturday passes are one event)
    const big = new Map<string, Party[]>();
    for (const p of parties.filter((x) => x.night_date >= today && x.night_date <= until && (BIG.test(x.title) || (x.price_from ?? 0) >= 90))) {
      const key = cleanTitle(p.title).replace(/\s*[(\[].*?[)\]]\s*/g, ' ').replace(/\s*[-|:].*$/, '').trim().toLowerCase() + '|' + p.venue_id;
      big.set(key, [...(big.get(key) ?? []), p]);
    }
    const bigs = [...big.values()].map((ns) => ns.sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
      .sort((a, b) => Math.max(...b.map(score)) - Math.max(...a.map(score)) || a[0].starts_at.localeCompare(b[0].starts_at)).slice(0, 12);
    for (const ns of bigs) {
      const p = ns[0], v = venueOf(p, venues);
      out.push({ slug: p.slug, name: cleanTitle(p.title).replace(/\s*[(\[].*?[)\]]\s*$/, ''), kind: 'big', date: p.night_date, end: ns.length > 1 ? ns[ns.length - 1].night_date : null,
        href: `/parties/${p.slug}`, nights: ns, note: v ? `${v.name}${v.neighborhood ? `, ${v.neighborhood}` : ''}` : '', datePage: dates.has(p.night_date) });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'holiday' ? -1 : 1));
  })();
  return cache;
}
