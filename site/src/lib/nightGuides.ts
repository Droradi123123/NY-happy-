/**
 * Nightlife guides computed from the live data at every build, like lib/autoGuides.ts: every number,
 * venue, night and price in them is read from the parties and bars on the site, so the text changes
 * when the calendar does and never states a fact we do not hold.
 *   - "Best clubs in NYC / Brooklyn / Manhattan": venues ranked by the nights they have on our list
 *   - "Techno / house / Latin / hip-hop clubs in NYC": the same, for one sound
 *   - "NYC nightlife guide", "How much a night out costs", "18+ clubs", "This weekend", "December"
 *   - "Best happy hours in NYC": bars scored on what their own sites publish
 * General rules that are the same everywhere (the drinking age, last call, tax, tipping) link to the
 * guides that cite their sources.
 */
import { allBars, partyData, venueOf, nightDate, cleanTitle, dealLabel, scheduleLabel, fmtDate, slugify, GENRE_NAME, DAYS, type Bar, type Party, type Venue } from './data';
import type { Guide } from './guides';
import type { Cell, GuideTable } from './guideTables';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const a = (href: string, text: string) => `<a href="${href}">${esc(text)}</a>`;
const list = (xs: string[], and = 'and') => (xs.length < 3 ? xs.join(` ${and} `) : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);
const money = (x: number) => `$${Math.round(x)}`;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** a meta description of at most 160 characters, cut at a word */
const fit = (t: string) => (t.length <= 160 ? t : `${t.slice(0, 158).replace(/[\s,;:]+\S*$/, '')}…`);
const tidy = (i: string) => i.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^(for|each)\s+/i, '').replace(/^menu\s+happy\s+hour\s+/i, '').replace(/\s+/g, ' ').trim();

// ---------- dates and times in New York ----------
const nyDay = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = Sunday
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const short = (d: string) => nightDate(d, { weekday: 'short', month: 'short', day: 'numeric' });
const long = (d: string) => nightDate(d, { weekday: 'long', month: 'long', day: 'numeric' });
/** minutes after midnight, New York time; a start after midnight counts as the same night (1am = 25:00) */
function startMin(p: Party): number | null {
  const iso = p.doors_at ?? p.starts_at;
  if (!iso) return null;
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).split(':').map(Number);
  const t = h * 60 + m;
  return t < 6 * 60 ? t + 24 * 60 : t;
}
const clock = (t: number) => { const x = Math.round(t / 15) * 15 % (24 * 60), h = Math.floor(x / 60), mm = x % 60, h12 = h % 12 || 12; return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`; };
const hhMin = (t: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// ---------- the data, shared by every guide in this file ----------
interface Ctx { today: string; parties: Party[]; venues: Venue[]; bars: Bar[]; lists: Set<string>; dates: Set<string>; hh: Set<string> }
let _ctx: Promise<Ctx> | null = null;
function ctx(): Promise<Ctx> {
  _ctx ??= (async () => {
    const { parties, venues } = await partyData();
    const { partyLists, datePages } = await import('./partyLists');
    const { listPages } = await import('./lists');
    const today = nyDay();
    return { today, parties: parties.filter((p) => p.night_date >= today), venues, bars: await allBars(), lists: new Set((await partyLists()).map((l) => l.slug)),
      dates: new Set((await datePages()).map((d) => d.date)), hh: new Set((await listPages()).map((l) => l.slug)) };
  })();
  return _ctx;
}
/** happy-hour drink prices we quote: $2 and up (lower ones wait for a person to confirm them, as in the cheapest-happy-hours guide) */
const drinkPrice = (b: Bar) => (!b.doubt && b.cheapestDrink !== null && b.cheapestDrink >= 2 ? b.cheapestDrink : null);
const within = (c: Ctx, days: number) => c.parties.filter((p) => p.night_date < addDays(c.today, days));
const genreName = (g: string) => GENRE_NAME[g] ?? cap(g.replace(/-/g, ' '));
/** a link to a party list page when this build has it, else the plain words */
const listLink = (c: Ctx, slug: string, text: string) => (c.lists.has(slug) ? a(`/parties/${slug}`, text) : esc(text));
/** a date page link when the night has one (two weeks ahead), else the plain words */
const dateLink = (c: Ctx, d: string, text: string) => (c.dates.has(d) ? a(`/parties/date/${d}`, text) : esc(text));
const partyLink = (p: Party) => a(`/parties/${p.slug}`, cleanTitle(p.title));
const venueLink = (v: Venue) => a(`/parties/venue/${v.id}`, v.name);
const price = (p: Party) => (p.price_status === 'free' ? 'free' : p.price_from ? `from ${money(p.price_from)}` : 'price not listed');
const area = (v: Venue | null, p?: Party) => v?.neighborhood ?? p?.neighborhood ?? v?.borough ?? p?.borough ?? 'NYC';
const BOROUGH_SLUG: Record<string, string> = { Manhattan: 'manhattan', Brooklyn: 'brooklyn', Queens: 'queens', 'The Bronx': 'bronx', Bronx: 'bronx', 'Staten Island': 'staten-island' };

interface VStat { v: Venue; nights: Party[]; genres: [string, number][]; low: number | null; free: number; start: number | null; next: Party }
function venueStats(ps: Party[], venues: Venue[]): VStat[] {
  const by = new Map<string, Party[]>();
  for (const p of ps) by.set(p.venue_id, [...(by.get(p.venue_id) ?? []), p]);
  const out: VStat[] = [];
  for (const [id, nights] of by) {
    const v = venues.find((x) => x.id === id);
    if (!v) continue;
    const g = new Map<string, number>();
    for (const p of nights) for (const x of p.genres) g.set(x, (g.get(x) ?? 0) + 1);
    const prices = nights.map((p) => p.price_from).filter((x): x is number => !!x && x > 0);
    const starts = nights.map(startMin).filter((x): x is number => x !== null);
    out.push({ v, nights, genres: [...g].sort((x, y) => y[1] - x[1]), low: prices.length ? Math.min(...prices) : null, free: nights.filter((p) => p.price_status === 'free').length,
      start: median(starts), next: nights.find((p) => p.event_status !== 'sold_out') ?? nights[0] });
  }
  return out.sort((x, y) => y.nights.length - x.nights.length || x.v.name.localeCompare(y.v.name));
}
const sound = (s: VStat, n = 2) => (s.genres.length ? list(s.genres.slice(0, n).map(([g]) => genreName(g).toLowerCase())) : 'a mix of sounds');
const ticketsFrom = (s: VStat) => (s.low !== null ? `from ${money(s.low)}` : s.free ? 'free' : 'price not listed');
/** party stats for a set of nights: what the answer boxes and FAQs quote */
function nightStats(ps: Party[]) {
  const prices = ps.map((p) => p.price_from).filter((x): x is number => !!x && x > 0);
  const starts = ps.map(startMin).filter((x): x is number => x !== null);
  const byDay = DAYS.map((_, i) => ps.filter((p) => weekday(p.night_date) === (i + 1) % 7).length); // mon..sun
  const boroughs = [...ps.reduce((m, p) => (p.borough ? m.set(p.borough, (m.get(p.borough) ?? 0) + 1) : m), new Map<string, number>())].sort((x, y) => y[1] - x[1]);
  const hoods = [...ps.reduce((m, p) => (p.neighborhood ? m.set(p.neighborhood, (m.get(p.neighborhood) ?? 0) + 1) : m), new Map<string, number>())].sort((x, y) => y[1] - x[1]);
  const genres = [...ps.reduce((m, p) => { for (const g of p.genres) m.set(g, (m.get(g) ?? 0) + 1); return m; }, new Map<string, number>())].sort((x, y) => y[1] - x[1]);
  return {
    n: ps.length, prices, low: prices.length ? Math.min(...prices) : null, med: median(prices), under30: prices.filter((x) => x <= 30).length,
    free: ps.filter((p) => p.price_status === 'free').length, start: median(starts), late: starts.filter((t) => t >= 22 * 60).length, starts: starts.length,
    adults: ps.filter((p) => p.age_min !== null && p.age_min >= 21).length, young: ps.filter((p) => p.age_min !== null && p.age_min < 21), aged: ps.filter((p) => p.age_min !== null).length,
    soldOut: ps.filter((p) => p.event_status === 'sold_out').length, byDay, boroughs, hoods, genres,
  };
}
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const busiest = (byDay: number[]) => byDay.map((n, i) => [DAY_FULL[i], n] as const).sort((x, y) => y[1] - x[1]);
/** up to n nights to book: one per venue, soonest first, not sold out */
function bookable(ps: Party[], n = 6): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const p of ps) if (p.event_status !== 'sold_out' && p.ticket_url && !seen.has(p.venue_id)) { seen.add(p.venue_id); out.push(p.slug); if (out.length >= n) break; }
  return out;
}
const TODAY_LINE = (c: Ctx) => fmtDate(c.today) ?? c.today;
const RULES = (c: Ctx) => [
  `Every night here is ${a('/blog/drinking-age-in-nyc', '21 and up')} unless the listing says otherwise, and the door checks a government photo ID; visitors from outside North America should bring a passport. Bars and clubs can serve until 4am (${a('/blog/what-time-do-bars-close-in-nyc', 'what time bars close')}), and the subway runs all night.`,
  `Ticket prices on this page are the lowest we saw on each seller's page when we last checked it (most nights sell on DICE, which shows the price with fees). Drinks inside are extra: menu prices in NYC do not include the 8.875% sales tax, and ${a('/blog/how-much-to-tip-at-a-bar-in-nyc', 'the tip')} is a dollar or more a drink.`,
];

// ---------- the tables (lib/guideTables.ts hands these ids over) ----------
export async function nightTable(id: string): Promise<GuideTable | null> {
  const c = await ctx();
  if (id.startsWith('clubs:')) {
    // clubs:<borough slug|all>:<sound|all>:<days>
    const [, b, s, d] = id.split(':');
    const ps = clubNights(c, b, s, Number(d) || 30);
    const rows = venueStats(ps, c.venues).slice(0, 30).map((x): Cell[] => [
      { text: x.v.name, href: `/parties/venue/${x.v.id}` }, { text: area(x.v) }, { text: String(x.nights.length) }, { text: x.genres.length ? x.genres.slice(0, 2).map(([g]) => genreName(g)).join(', ') : 'mixed' },
      { text: x.start !== null ? clock(x.start) : 'not listed' }, { text: ticketsFrom(x) }, { text: short(x.next.night_date), href: `/parties/${x.next.slug}` },
    ]);
    return { caption: `Venues ranked by nights on our list in the next ${Number(d) || 30} days`, head: ['Venue', 'Area', 'Nights', 'Music', 'Usual start', 'Tickets', 'Next night'], rows,
      note: `Counted on ${TODAY_LINE(c)} from the published nights on the site, refreshed every day. "Usual start" is the middle start time of the venue's nights; ticket prices are the lowest seen on the seller's page, with fees, and change.` };
  }
  if (id.startsWith('nights:')) {
    const key = id.slice(7);
    const ps = key === 'young' ? c.parties.filter((p) => p.age_min !== null && p.age_min < 21)
      : key === 'weekend' ? weekendNights(c).ps
      : key === 'december' ? c.parties.filter((p) => p.night_date.slice(5, 7) === '12' && p.night_date.slice(0, 4) === decemberYear(c))
      : [];
    const rows = ps.slice(0, 60).map((p): Cell[] => {
      const v = venueOf(p, c.venues);
      const t = startMin(p);
      return [{ text: short(p.night_date) }, { text: cleanTitle(p.title), href: `/parties/${p.slug}` }, { text: v?.name ?? 'TBA', ...(v ? { href: `/parties/venue/${v.id}` } : {}) }, { text: area(v, p) },
        { text: t !== null ? clock(t) : '' }, { text: p.age_min ? `${p.age_min}+` : 'not stated' }, { text: p.event_status === 'sold_out' ? 'Sold out' : cap(price(p)) }];
    });
    return { caption: `${plural(ps.length, 'night')}${ps.length > 60 ? ', the first 60' : ''}`, head: ['Night', 'Party', 'Venue', 'Area', 'Starts', 'Age', 'Tickets'], rows,
      note: 'Ticket prices are the lowest listed when we last checked the ticket page, with fees; they change. Nights that are over leave this table at the next daily update.' };
  }
  if (id === 'prices:sound') {
    const ps = within(c, 60);
    const rows: Cell[][] = [];
    for (const [g, n] of nightStats(ps).genres.filter(([, n]) => n >= 5).slice(0, 14)) {
      const s = nightStats(ps.filter((p) => p.genres.includes(g)));
      if (!s.prices.length) continue;
      rows.push([{ text: genreName(g), ...(c.lists.has(g) ? { href: `/parties/${g}` } : {}) }, { text: String(n) }, { text: money(s.low!) }, { text: money(s.med!) }, { text: `${pct(s.under30, s.prices.length)}%` }]);
    }
    return { caption: 'Club ticket prices by sound, next 60 days', head: ['Sound', 'Nights', 'Cheapest', 'Typical (median)', 'Share $30 or less'], rows,
      note: `Lowest price listed per night, with fees, counted on ${TODAY_LINE(c)}. Sounds with at least five nights; a night with several genres counts under each.` };
  }
  if (id === 'nightlife-hoods') {
    const ps = within(c, 30);
    const rows: Cell[][] = [];
    for (const [h, n] of nightStats(ps).hoods.slice(0, 15)) {
      const bars = c.bars.filter((b) => slugify(b.hood) === slugify(h));
      const drinks = bars.map(drinkPrice).filter((x): x is number => x !== null);
      const vs = new Set(ps.filter((p) => p.neighborhood === h).map((p) => p.venue_id)).size;
      rows.push([{ text: h, ...(c.lists.has(slugify(h)) ? { href: `/parties/${slugify(h)}` } : {}) }, { text: String(n) }, { text: String(vs) },
        { text: bars.length ? String(bars.length) : '0', ...(bars.length && c.hh.has(bars[0].hoodSlug) ? { href: `/happy-hours/${bars[0].hoodSlug}` } : {}) }, { text: drinks.length ? money(Math.min(...drinks)) : 'none listed' }]);
    }
    return { caption: 'Neighborhoods with the most nights out, next 30 days', head: ['Neighborhood', 'Party nights', 'Venues', 'Happy hours we track', 'Cheapest happy-hour drink'], rows,
      note: `Counted on ${TODAY_LINE(c)}. Party nights are the published nights on the site; happy hours are the bars we track in the same neighborhood, with the lowest drink price their own sites list.` };
  }
  if (id === 'top-hh') {
    const rows: Cell[][] = scoredBars(c).slice(0, 40).map(({ b }) => [{ text: b.name, href: `/bars/${b.slug}` }, { text: b.hood, ...(c.hh.has(b.hoodSlug) ? { href: `/happy-hours/${b.hoodSlug}` } : {}) }, { text: dealLabel(b) ?? '' }, { text: scheduleLabel(b) }, { text: fmtDate(b.checked) ?? '' }]);
    return { caption: 'The 40 highest-scoring happy hours on our list', head: ['Bar', 'Neighborhood', 'Deal', 'When', 'Checked'], rows,
      note: 'Bars whose happy hour we read on their own site in the last 30 days, scored on drink price, days a week, food and weekend or late hours. Menu prices before NYC tax (8.875%) and tip.' };
  }
  return null;
}

// ---------- clubs ----------
const SOUNDS: Record<string, { genres: string[]; name: string }> = {
  techno: { genres: ['techno', 'trance', 'electro'], name: 'techno' },
  house: { genres: ['house', 'afro-house', 'disco', 'garage'], name: 'house music' },
  latin: { genres: ['latin', 'reggaeton'], name: 'Latin and reggaeton' },
  'hip-hop': { genres: ['hip-hop', 'r-and-b'], name: 'hip-hop and R&B' },
};
function clubNights(c: Ctx, b: string, s: string, days: number) {
  return within(c, days).filter((p) => (b === 'all' || BOROUGH_SLUG[p.borough ?? ''] === b) && (s === 'all' || p.genres.some((g) => SOUNDS[s].genres.includes(g))));
}

interface ClubSpec { slug: string; lead: string; keyword: string; title: string; h1: string; short: string; borough: string; sound: string; days: number; place: string; related: [string, string][] }
const CLUBS: ClubSpec[] = [
  { slug: 'best-clubs-in-nyc', lead: 'The best clubs in NYC', keyword: 'best clubs in nyc', title: 'Best Clubs in NYC: Ranked by Nights on the Calendar', h1: 'The best clubs in NYC right now, ranked by nights on the calendar', short: 'Best clubs in NYC', borough: 'all', sound: 'all', days: 30, place: 'NYC',
    related: [['Parties tonight', '/parties/tonight'], ['Parties this weekend', '/parties/this-weekend'], ['Best clubs in Brooklyn', '/blog/best-clubs-in-brooklyn'], ['Best clubs in Manhattan', '/blog/best-clubs-in-manhattan'], ['NYC nightlife guide', '/blog/nyc-nightlife-guide'], ['All party genres', '/parties/genres']] },
  { slug: 'best-clubs-in-brooklyn', lead: 'The best clubs in Brooklyn', keyword: 'best clubs in brooklyn', title: 'Best Clubs in Brooklyn: Where the Nights Are', h1: 'The best clubs in Brooklyn, ranked by nights on the calendar', short: 'Best clubs in Brooklyn', borough: 'brooklyn', sound: 'all', days: 30, place: 'Brooklyn',
    related: [['Parties in Brooklyn', '/parties/brooklyn'], ['Parties tonight in Brooklyn', '/parties/brooklyn/tonight'], ['Bushwick bar crawl', '/blog/bushwick-bar-crawl'], ['Williamsburg bar crawl', '/blog/williamsburg-bar-crawl'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
  { slug: 'best-clubs-in-manhattan', lead: 'The best clubs in Manhattan', keyword: 'best clubs in manhattan', title: 'Best Clubs in Manhattan: Ranked by Nights Listed', h1: 'The best clubs in Manhattan, ranked by nights on the calendar', short: 'Best clubs in Manhattan', borough: 'manhattan', sound: 'all', days: 30, place: 'Manhattan',
    related: [['Parties in Manhattan', '/parties/manhattan'], ['Parties tonight in Manhattan', '/parties/manhattan/tonight'], ['Lower East Side bar crawl', '/blog/lower-east-side-bar-crawl'], ['Chelsea bar crawl', '/blog/chelsea-bar-crawl'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
  { slug: 'techno-clubs-nyc', lead: 'Techno clubs in NYC', keyword: 'techno clubs nyc', title: 'Techno Clubs NYC: Where the Techno Nights Are', h1: 'Techno clubs in NYC: the venues with the most techno nights', short: 'Techno clubs', borough: 'all', sound: 'techno', days: 60, place: 'NYC',
    related: [['Techno parties', '/parties/techno'], ['Raves and warehouse parties', '/parties/warehouse-raves'], ['After hours', '/parties/after-hours'], ['House music clubs', '/blog/house-music-clubs-nyc'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
  { slug: 'house-music-clubs-nyc', lead: 'House music clubs in NYC', keyword: 'house music clubs nyc', title: 'House Music Clubs NYC: Venues With the Most Nights', h1: 'House music clubs in NYC: where house, disco and afro house play', short: 'House music clubs', borough: 'all', sound: 'house', days: 60, place: 'NYC',
    related: [['House parties', '/parties/house'], ['Disco parties', '/parties/disco'], ['Afro house parties', '/parties/afro-house'], ['Techno clubs', '/blog/techno-clubs-nyc'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
  { slug: 'latin-clubs-nyc', lead: 'Latin clubs in NYC', keyword: 'latin clubs nyc', title: 'Latin Clubs NYC: Reggaeton and Latin Nights', h1: 'Latin clubs in NYC: where the reggaeton and Latin nights are', short: 'Latin clubs', borough: 'all', sound: 'latin', days: 60, place: 'NYC',
    related: [['Latin parties', '/parties/latin'], ['Reggaeton parties', '/parties/reggaeton'], ['Hip-hop clubs', '/blog/hip-hop-clubs-nyc'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
  { slug: 'hip-hop-clubs-nyc', lead: 'Hip hop clubs in NYC', keyword: 'hip hop clubs nyc', title: 'Hip Hop Clubs NYC: Hip-Hop and R&B Nights', h1: 'Hip hop clubs in NYC: where the hip-hop and R&B nights are', short: 'Hip-hop clubs', borough: 'all', sound: 'hip-hop', days: 60, place: 'NYC',
    related: [['Hip-hop parties', '/parties/hip-hop'], ['R&B parties', '/parties/r-and-b'], ['Latin clubs', '/blog/latin-clubs-nyc'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']] },
];

function clubGuide(c: Ctx, s: ClubSpec): Guide | null {
  const ps = clubNights(c, s.borough, s.sound, s.days);
  const vs = venueStats(ps, c.venues);
  if (!vs.length) return null;
  const st = nightStats(ps);
  const top = vs.slice(0, 10);
  const what = s.sound === 'all' ? 'nights' : `${SOUNDS[s.sound].name} nights`;
  const span = s.days === 30 ? 'the next 30 days' : `the next ${s.days} days`;
  const days = busiest(st.byDay);
  const t3 = top.slice(0, 3).map((x) => `${x.v.name} (${plural(x.nights.length, 'night')})`);
  const lead = s.sound === 'all'
    ? `Ranking clubs by taste starts arguments; ranking them by what is on the calendar does not. We count the published nights at every venue on our list for ${span}, from the ticket pages we read every day, and rank the venues by that count.`
    : `A club's sound is whatever it books. We count the ${SOUNDS[s.sound].name} nights on our list for ${span} (a night counts when its seller tags it ${list(SOUNDS[s.sound].genres.map((g) => genreName(g).toLowerCase()), 'or')}) and rank the venues by how many they host.`;
  const boroughLine = s.borough === 'all' && st.boroughs.length > 1
    ? `${cap(list(st.boroughs.map(([b, n]) => `${b} has ${n} (${pct(n, st.n)}%)`)))}.`
    : s.borough !== 'all' ? `${cap(list(st.hoods.slice(0, 4).map(([h, n]) => `${h} has ${n}`)))}${st.hoods.length > 4 ? `, and ${plural(st.hoods.length - 4, 'more neighborhood')} share the rest` : ''}.` : '';
  const sections: Guide['sections'] = [
    { h2: `The top ${top.length}, one by one`, paras: top.map((x, i) => `<strong>${i + 1}. ${venueLink(x.v)}</strong>, ${esc(area(x.v))}: ${plural(x.nights.length, s.sound === 'all' ? 'night' : `${SOUNDS[s.sound].name} night`)} in ${span}, ${!x.genres.length ? 'with no genre tagged by the seller' : s.sound === 'all' ? `mostly ${esc(sound(x))}` : `with ${esc(sound(x))} on the bills`}. ${x.start !== null ? `Nights usually start around ${clock(x.start)}; ` : ''}tickets ${ticketsFrom(x)}. Next up: ${partyLink(x.next)} on ${short(x.next.night_date)}${x.next.event_status === 'sold_out' ? ' (sold out)' : `, ${price(x.next)}`}.`) },
    { h2: s.borough === 'all' ? 'Where the nights are' : `Where in ${s.place}`, paras: [
      `We list ${plural(st.n, what.replace(/s$/, ''), what)} at ${plural(vs.length, 'venue')} for ${span}. ${boroughLine}`,
      s.borough === 'all'
        ? `By neighborhood, ${list(st.hoods.slice(0, 5).map(([h, n]) => `${esc(h)} (${n})`))} lead. ${listLink(c, 'brooklyn', 'Brooklyn')}, ${listLink(c, 'manhattan', 'Manhattan')} and ${listLink(c, 'queens', 'Queens')} each have their own party list, night by night.`
        : `Every ${s.place} night is on the ${listLink(c, s.borough, `parties in ${s.place}`)} page, and tonight's are on ${listLink(c, `${s.borough}/tonight`, `parties tonight in ${s.place}`)}.`,
    ] },
    { h2: 'When to go and what it costs', paras: [
      `${days[0][0]} is the busiest night with ${plural(days[0][1], 'night')}, then ${days[1][0]} (${days[1][1]}) and ${days[2][0]} (${days[2][1]}).${days[0][1] + days[1][1] > st.n * 0.6 ? ' Most of the calendar is Friday and Saturday; midweek nights are fewer, cheaper and easier to get into.' : ''}${st.start !== null ? ` The typical night starts around ${clock(st.start)}, and ${pct(st.late, st.starts)}% start at 10pm or later.` : ''}`,
      st.prices.length ? `Tickets start at ${money(st.low!)} and the typical lowest price is ${money(st.med!)}; ${pct(st.under30, st.prices.length)}% of the priced nights cost $30 or less${st.free ? `, and ${plural(st.free, 'night is', 'nights are')} free` : ''}. ${st.soldOut ? `${plural(st.soldOut, 'night was', 'nights were')} already sold out when we last checked, so buy early for the big names.` : ''}` : 'The sellers have not published prices for these nights yet.',
    ] },
    { h2: 'Before you go', paras: RULES(c) },
  ];
  if (s.sound === 'all') sections.splice(2, 0, { h2: 'By sound', paras: [
    `The most booked sounds are ${list(st.genres.slice(0, 6).map(([g, n]) => `${listLink(c, g, genreName(g).toLowerCase())} (${n})`))}. For one sound, see ${a('/blog/techno-clubs-nyc', 'techno clubs')}, ${a('/blog/house-music-clubs-nyc', 'house music clubs')}, ${a('/blog/latin-clubs-nyc', 'Latin clubs')} and ${a('/blog/hip-hop-clubs-nyc', 'hip hop clubs')}.`,
  ] });
  else {
    const pages = SOUNDS[s.sound].genres.filter((g) => c.lists.has(g));
    sections.splice(2, 0, { h2: 'Who else plays it', paras: [
      `Beyond the top ${top.length}, ${vs.length > top.length ? `${plural(vs.length - top.length, 'more venue')} host at least one ${SOUNDS[s.sound].name} night in ${span}; they are in the table below.` : 'no other venue on our list has one in that time.'}${pages.length ? ` Every night is on the ${list(pages.map((g) => listLink(c, g, `${genreName(g).toLowerCase()} parties`)))} ${pages.length > 1 ? 'pages' : 'page'}.` : ''}`,
    ] });
  }
  const faq = [
    { q: s.sound === 'all' ? `What is the best club in ${s.place}?` : `What is the best ${SOUNDS[s.sound].name} club in NYC?`, a: `There is no single answer, but by nights on the calendar ${vs[0].v.name} leads with ${plural(vs[0].nights.length, 'night')} in ${span}${vs[1] ? `, ahead of ${vs[1].v.name} (${vs[1].nights.length})` : ''}${vs[2] ? ` and ${vs[2].v.name} (${vs[2].nights.length})` : ''}.` },
    ...(st.start !== null ? [{ q: `What time do ${s.sound === 'all' ? `clubs in ${s.place}` : `${SOUNDS[s.sound].name} nights`} start?`, a: `The typical night on our list starts around ${clock(st.start)}; ${pct(st.late, st.starts)}% start at 10pm or later. Clubs can serve until 4am.` }] : []),
    ...(st.prices.length ? [{ q: `How much does it cost to get in?`, a: `Tickets on our list start at ${money(st.low!)}; the typical lowest price is ${money(st.med!)}, with fees. ${pct(st.under30, st.prices.length)}% of the priced nights cost $30 or less.` }] : []),
    { q: 'Do I need to be 21?', a: st.young.length ? `Almost always: ${st.aged ? `${pct(st.adults, st.aged)}%` : 'most'} of these nights are 21+, and ${plural(st.young.length, 'night is', 'nights are')} open to 18+. Bring a government photo ID.` : `Yes: every night here with an age limit is 21+. Bring a government photo ID.` },
    { q: `Which night is busiest?`, a: `${days[0][0]}, with ${days[0][1]} of the ${st.n} nights, then ${days[1][0]}.` },
  ];
  return {
    slug: s.slug, status: 'published', published: '2026-10-30', updated: c.today,
    title: s.title, h1: s.h1, short: s.short, keyword: s.keyword,
    description: fit(`${s.lead}, ranked by the nights each has on the calendar: music, start times, ticket prices and the next night, updated daily.`),
    answer: `The ${s.sound === 'all' ? `${s.place} clubs` : `${SOUNDS[s.sound].name} venues`} with the most nights on our list for ${span} are ${list(t3)}. We count ${plural(st.n, what.replace(/s$/, ''), what)} at ${plural(vs.length, 'venue')}${st.prices.length ? `. Tickets start at ${money(st.low!)} (typically ${money(st.med!)})` : ''}${st.start !== null ? ` and the typical night starts around ${clock(st.start)}` : ''}. Updated ${TODAY_LINE(c)}.`,
    intro: [lead, `Below: the top ${top.length} with what they play and their next night, where the nights are, when to go and what it costs, and a table of every venue with the date of its next night. Ticket buttons go straight to the seller.`].join('\n\n'),
    nights: bookable(top.map((x) => x.next).concat(ps)), nightsTitle: 'Next nights at these clubs', venues: top.map((x) => x.v.id),
    sections, faq,
    table: `clubs:${s.borough}:${s.sound}:${s.days}`, tableTitle: s.borough === 'all' && s.sound === 'all' ? 'Every venue, ranked' : `Every ${s.sound === 'all' ? s.place : SOUNDS[s.sound].name} venue, ranked`,
    method: `Counted on ${TODAY_LINE(c)} from the published nights on the site (most read from DICE, the rest from the sellers' own pages), and recomputed every day. A venue's rank is its number of ${what} in ${span}; music is the genres the sellers tag; prices are the lowest listed, with fees. We do not take payment for placement.`,
    related: s.related,
  };
}

// ---------- NYC nightlife guide ----------
function nightlifeGuide(c: Ctx): Guide | null {
  const ps = within(c, 30);
  if (ps.length < 10) return null;
  const st = nightStats(ps);
  const vs = venueStats(ps, c.venues);
  const hh = c.bars.filter((b) => b.windows.length && !b.doubt);
  const priced = hh.map(drinkPrice).filter((x): x is number => x !== null);
  const startCount = new Map<number, number>();
  for (const b of hh) for (const w of b.windows) { const m = hhMin(w.start); if (m !== null && m >= 12 * 60 && m <= 19 * 60) startCount.set(m, (startCount.get(m) ?? 0) + 1); }
  const hhStart = [...startCount].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const wkend = hh.filter((b) => b.weekend).length, late = hh.filter((b) => b.late).length;
  const days = busiest(st.byDay);
  return {
    slug: 'nyc-nightlife-guide', status: 'published', published: '2026-10-30', updated: c.today,
    title: 'NYC Nightlife Guide: Happy Hour, Clubs and Costs', h1: 'The NYC nightlife guide: from happy hour to last call, by the numbers', short: 'NYC nightlife guide', keyword: 'nyc nightlife guide',
    description: fit(`Our NYC nightlife guide, built on data: ${st.n} party nights in the next 30 days, ${hh.length} happy hours, what a night costs and the rules to know.`),
    answer: `A night out in NYC runs on two clocks: happy hour, most often from ${hhStart !== null ? clock(hhStart) : 'the late afternoon'}, and club nights that typically start around ${st.start !== null ? clock(st.start) : 'late evening'}. In the next 30 days we list ${st.n} party nights at ${vs.length} venues, ${list(st.boroughs.slice(0, 3).map(([b, n]) => `${pct(n, st.n)}% in ${b}`))}, with tickets from ${st.low !== null ? money(st.low) : 'free'} (typically ${st.med !== null ? money(st.med) : 'not listed'}), and ${hh.length} happy hours${priced.length ? ` with drinks from ${money(Math.min(...priced))}` : ''}.`,
    intro: [
      'Most nightlife guides are a list of places someone likes. This one is built from what we track every day: the happy hours bars publish on their own sites and the club nights sold on the ticket pages. Every number below is computed from that data and updates daily.',
      `Read it in order: how the night runs, where to go, what it costs, and the rules that catch visitors out. Updated ${TODAY_LINE(c)}.`,
    ].join('\n\n'),
    nights: bookable(ps), nightsTitle: 'Coming up this week', venues: vs.slice(0, 6).map((x) => x.v.id),
    sections: [
      { h2: 'How a night out runs', paras: [
        `Start early. ${hhStart !== null ? `The most common happy-hour start on our list is ${clock(hhStart)}` : 'Happy hours start in the afternoon'}, and ${pct(hh.filter((b) => b.windows.some((w) => (hhMin(w.end) ?? 0) >= 19 * 60)).length, hh.length)}% of the bars run it until 7pm or later. ${a('/happy-hours/now', 'Happy hours on right now')} shows the ones running as you read this.`,
        `Then the party. ${st.start !== null ? `The typical club night starts around ${clock(st.start)} and ${pct(st.late, st.starts)}% start at 10pm or later` : 'Club nights start late'}; bars and clubs can serve until 4am. ${late ? `${plural(late, 'bar')} on our list run a second, late-night happy hour (${a('/blog/reverse-happy-hour-nyc', 'reverse happy hour')}).` : ''}`,
        `${days[0][0]} is the biggest night with ${days[0][1]} parties in the next 30 days, then ${days[1][0]} (${days[1][1]}); ${days[days.length - 1][0]} is the quietest (${days[days.length - 1][1]}). Every night has its own page: ${listLink(c, 'tonight', 'parties tonight')}, ${listLink(c, 'this-weekend', 'this weekend')} and ${a('/parties', 'every party')}.`,
      ] },
      { h2: 'Where to go', paras: [
        `${st.boroughs.map(([b, n], i) => (i ? `${b} ${n}` : `${b} has ${n} of the nights`)).join(', ').replace(/, ([^,]+)$/, ' and $1')}. The neighborhoods with the most are ${list(st.hoods.slice(0, 6).map(([h, n]) => `${esc(h)} (${n})`))}; the table below adds the happy hours in each.`,
        `The venues with the most nights are ${list(vs.slice(0, 5).map((x) => `${venueLink(x.v)} (${x.nights.length})`))}. The full ranking is in ${a('/blog/best-clubs-in-nyc', 'the best clubs in NYC')}, with ${a('/blog/best-clubs-in-brooklyn', 'Brooklyn')} and ${a('/blog/best-clubs-in-manhattan', 'Manhattan')} on their own. For a neighborhood, see ${a('/blog/best-neighborhoods-for-nightlife-nyc', 'the best neighborhoods for nightlife')}.`,
        `By sound: ${list(st.genres.slice(0, 6).map(([g, n]) => `${listLink(c, g, genreName(g).toLowerCase())} (${n})`))}. ${a('/parties/genres', 'Every genre')} has a page.`,
      ] },
      { h2: 'What it costs', paras: [
        `${priced.length ? `The typical cheapest happy-hour drink on our list is ${money(median(priced)!)} and the cheapest is ${money(Math.min(...priced))} (${a('/blog/cheapest-happy-hours-nyc', 'the cheapest happy hours')}).` : ''} ${st.prices.length ? `Club tickets start at ${money(st.low!)}; the typical lowest price is ${money(st.med!)}, and ${pct(st.under30, st.prices.length)}% of priced nights cost $30 or less.` : ''} ${st.free ? `${plural(st.free, 'night is', 'nights are')} free (${listLink(c, 'free', 'free parties')}).` : ''}`,
        `The full budget, with tax and tip, is in ${a('/blog/how-much-does-a-night-out-cost-in-nyc', 'how much a night out costs in NYC')}.`,
      ] },
      { h2: 'Weekends, late nights and the week', paras: [
        `${plural(wkend, 'bar')} on our list run a happy hour on Saturday or Sunday (${a('/blog/best-weekend-happy-hours-nyc', 'weekend happy hours')}). Midweek is cheaper and easier: ${a('/trivia', 'trivia nights')} fill Monday to Thursday, and ${listLink(c, 'thursday', 'Thursday night parties')} are where the week starts for many.`,
        `What is coming up this weekend is in ${a('/blog/things-to-do-in-nyc-this-weekend', 'things to do in NYC this weekend')}; for the holidays, ${a('/blog/things-to-do-in-nyc-in-december', 'December in NYC')}.`,
      ] },
      { h2: 'Rules to know', paras: [
        ...RULES(c),
        `Drinking on the street is not allowed (${a('/blog/can-you-drink-in-public-in-nyc', 'can you drink in public in NYC')}), and happy hour itself has its own rules in New York (${a('/blog/is-happy-hour-legal-in-new-york', 'is happy hour legal')}).`,
      ] },
    ],
    faq: [
      { q: 'Where is the best nightlife in NYC?', a: `By nights on the calendar, ${st.boroughs[0][0]}: it has ${pct(st.boroughs[0][1], st.n)}% of the party nights we list for the next 30 days, led by ${list(nightStats(ps.filter((p) => p.borough === st.boroughs[0][0])).hoods.slice(0, 3).map(([h]) => h))}.` },
      ...(st.start !== null ? [{ q: 'What time does nightlife start in NYC?', a: `Happy hour ${hhStart !== null ? `most often starts at ${clock(hhStart)}` : 'starts in the afternoon'}; club nights typically start around ${clock(st.start)}. Bars and clubs can serve until 4am.` }] : []),
      { q: 'What is the best night to go out in NYC?', a: `${days[0][0]} has the most parties on our list (${days[0][1]} in the next 30 days), then ${days[1][0]} (${days[1][1]}).` },
      ...(st.prices.length && priced.length ? [{ q: 'How expensive is NYC nightlife?', a: `Happy-hour drinks on our list typically start at ${money(median(priced)!)}; club tickets typically start at ${money(st.med!)} with fees. Add 8.875% tax and the tip on drinks.` }] : []),
      { q: 'Is NYC nightlife 21+?', a: `Almost all of it: ${st.aged ? pct(st.adults, st.aged) : 100}% of the nights we list with an age limit are 21+; our 18+ clubs guide lists the exceptions.` },
    ],
    table: 'nightlife-hoods', tableTitle: 'Neighborhoods ranked by nights out',
    method: `Computed on ${TODAY_LINE(c)} from the ${st.n} published party nights on the site for the next 30 days and the ${hh.length} happy hours we track (each read from the bar's own site), and recomputed every day.`,
    related: [['Happy hours right now', '/happy-hours/now'], ['Parties tonight', '/parties/tonight'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc'], ['Things to do in NYC at night', '/blog/things-to-do-in-nyc-at-night'], ['The happy hour map', '/map/happy-hours']],
  };
}

// ---------- what a night out costs ----------
function costGuide(c: Ctx): Guide | null {
  const ps = within(c, 60);
  const st = nightStats(ps);
  const priced = c.bars.map(drinkPrice).filter((x): x is number => x !== null);
  if (st.prices.length < 10 || priced.length < 10) return null;
  const drink = median(priced)!, ticket = st.med!;
  const TAX = 0.08875;
  // two happy-hour drinks and two at the club's bar are not ours to price; the budget counts what we hold
  const hhTotal = 2 * drink * (1 + TAX) + 2; // two drinks, tax, a dollar tip each
  const total = hhTotal + ticket;
  const wk = ps.filter((p) => [5, 6].includes(weekday(p.night_date)));
  const mid = ps.filter((p) => [1, 2, 3, 4].includes(weekday(p.night_date)));
  const sw = nightStats(wk), sm = nightStats(mid);
  const bo = st.boroughs.map(([b]) => [b, nightStats(ps.filter((p) => p.borough === b))] as const).filter(([, s]) => s.prices.length >= 5);
  return {
    slug: 'how-much-does-a-night-out-cost-in-nyc', status: 'published', published: '2026-10-30', updated: c.today,
    title: 'How Much Does a Night Out Cost in NYC? Real Prices', h1: 'How much does a night out cost in NYC? Drinks, tickets, tax and tip', short: 'Cost of a night out', keyword: 'how much does a night out cost in nyc',
    description: fit(`How much does a night out cost in NYC? Typical happy-hour drink ${money(drink)}, club ticket ${money(ticket)}, plus tax and tip, by sound, night and borough.`),
    answer: `About ${money(total)} per person for two happy-hour drinks and a club ticket, using the typical prices on our list: the typical cheapest happy-hour drink is ${money(drink)} (${money(drink * (1 + TAX))} with 8.875% tax, plus a dollar or more tip) and the typical lowest club ticket is ${money(ticket)} with fees. Drinks inside the club are extra, and ${pct(st.under30, st.prices.length)}% of club nights cost $30 or less to get in.`,
    intro: [
      'What a night out in New York costs depends on three numbers: what you drink before, what you pay at the door, and what you drink inside. We track the first two every day, from the happy hours bars publish on their own sites and the ticket prices on the sellers\' pages. The third we do not hold, so we do not guess it.',
      `All prices below are computed from our data on ${TODAY_LINE(c)} and change daily.`,
    ].join('\n\n'),
    nights: bookable(ps.filter((p) => (p.price_from !== null && p.price_from <= 30) || p.price_status === 'free')), nightsTitle: 'Nights for $30 or less',
    sections: [
      { h2: 'Before the party: happy hour', paras: [
        `Across the ${priced.length} happy hours with a drink price on our list, the typical cheapest drink is ${money(drink)} and the cheapest is ${money(Math.min(...priced))}; ${pct(priced.filter((x) => x <= 6).length, priced.length)}% have a drink at $6 or less (${a('/happy-hours/cheap-drinks', 'drinks $6 and under')}).`,
        `Menu prices do not include the 8.875% sales tax, and the custom is to tip a dollar or more a drink (${a('/blog/how-much-to-tip-at-a-bar-in-nyc', 'how much to tip')}). Two drinks at ${money(drink)} come to about ${money(hhTotal)} with tax and tip.`,
      ] },
      { h2: 'At the door: club tickets', paras: [
        `For the ${plural(st.n, 'night')} on our list in the next 60 days, the cheapest ticket is ${money(st.low!)} and the typical lowest price is ${money(ticket)}, with fees; ${pct(st.under30, st.prices.length)}% cost $30 or less${st.free ? ` and ${plural(st.free, 'night is', 'nights are')} free` : ''}. The price on the seller's page usually rises as tiers sell out, so the earlier you buy, the closer you pay to the lowest price.`,
        sw.med !== null && sm.med !== null ? `Fridays and Saturdays typically start at ${money(sw.med)}; Monday to Thursday at ${money(sm.med)}.${sm.med < sw.med ? ' Midweek is the cheaper night out.' : ''}` : '',
        bo.length > 1 ? `By borough: ${list(bo.map(([b, s]) => `${b} typically ${money(s.med!)}`))}.` : '',
      ].filter(Boolean) },
      { h2: 'By sound', paras: [
        'Some sounds cost more than others to see: a touring headliner sells at a higher price than a local residency. The table below has the cheapest and typical ticket for every sound with at least five nights.',
      ] },
      { h2: 'Ways to spend less', paras: [
        `Go midweek, buy early, and drink at happy hour near the venue: every party page lists the closest happy hours, and ${a('/blog/cheapest-happy-hours-nyc', 'the cheapest happy hours')} are by neighborhood. ${listLink(c, 'free', 'Free parties')} and ${a('/blog/free-things-to-do-in-nyc-at-night', 'free things to do at night')} cost nothing at the door.`,
        'The subway is the cheapest way home and runs all night.',
      ] },
    ],
    faq: [
      { q: 'How much is a drink at a bar in NYC?', a: `At happy hour, the typical cheapest drink on our list is ${money(drink)} before 8.875% tax and tip; the cheapest is ${money(Math.min(...priced))}. Regular menu prices are higher and not something we track.` },
      { q: 'How much are club tickets in NYC?', a: `The typical lowest price is ${money(ticket)} with fees; the cheapest night on our list is ${money(st.low!)}, and ${pct(st.under30, st.prices.length)}% cost $30 or less.` },
      { q: 'Is it cheaper to go out midweek?', a: sw.med !== null && sm.med !== null ? `On our list, Friday and Saturday tickets typically start at ${money(sw.med)} and Monday to Thursday at ${money(sm.med)}.` : 'Midweek nights are often cheaper; check the price on each party page.' },
      { q: 'Do NYC prices include tax?', a: 'No. Menu prices in New York City do not include the 8.875% sales tax. Ticket prices on DICE are shown with fees.' },
      { q: 'How much should I tip?', a: 'A dollar or more per drink, or 18 to 20 percent on a tab. Tip on the regular price, not the happy-hour price.' },
    ],
    table: 'prices:sound', tableTitle: 'Club ticket prices by sound',
    method: `Computed on ${TODAY_LINE(c)} from the cheapest drink each bar's own site lists at happy hour (${priced.length} bars) and the lowest ticket price on the seller's page for each of the ${st.n} nights in the next 60 days, recomputed daily. The budget counts two happy-hour drinks at the typical price, 8.875% tax, a dollar tip per drink and the typical ticket; it leaves out drinks inside the venue and the ride home.`,
    related: [['Drinks $6 and under', '/happy-hours/cheap-drinks'], ['Cheapest happy hours', '/blog/cheapest-happy-hours-nyc'], ['Free parties', '/parties/free'], ['Cheap date night', '/blog/cheap-date-night-nyc'], ['NYC nightlife guide', '/blog/nyc-nightlife-guide']],
  };
}

// ---------- 18+ ----------
function youngGuide(c: Ctx): Guide | null {
  const ys = c.parties.filter((p) => p.age_min !== null && p.age_min < 21);
  const st = nightStats(c.parties);
  if (!c.parties.length) return null;
  const vs = venueStats(ys, c.venues);
  return {
    slug: '18-plus-clubs-nyc', status: 'published', published: '2026-10-30', updated: c.today,
    title: '18+ Clubs in NYC: Every 18 and Over Night We List', h1: '18+ clubs in NYC: the nights you can get into under 21', short: '18+ clubs', keyword: '18+ clubs in nyc',
    description: fit(`18+ clubs in NYC: of ${st.n} upcoming nights on our list, ${ys.length} let in 18 to 20 year olds. Every one, with the venue, date and price, updated daily.`),
    answer: ys.length
      ? `Most NYC clubs are 21+: of the ${st.n} upcoming nights we list, ${ys.length} ${ys.length === 1 ? 'is' : 'are'} open to under-21s, at ${list(vs.map((x) => `${x.v.name} in ${area(x.v)}`))}. The first is ${cleanTitle(ys[0].title)} on ${long(ys[0].night_date)}. New York's drinking age is 21, so an 18+ night means you can dance but not drink.`
      : `Right now none of the ${st.n} upcoming nights on our list is open to under-21s: every NYC club night we track is 21+. This page updates daily, so check back; the drinking age in New York is 21.`,
    intro: [
      `The age limit is set by each party, not by the club, and it is printed on the ticket page. We read it from there for every night we list: ${st.aged ? `${pct(st.adults, st.aged)}%` : 'nearly all'} of the nights with a stated limit are 21+, so 18+ nights are rare and worth booking early.`,
      'An 18+ night lets you in, not to the bar: New York\'s drinking age is 21, the door checks ID, and venues often mark under-21s with a wristband or stamp so the bar can tell. Bring a government photo ID; the accepted ones are in <a href="/blog/drinking-age-in-nyc">our guide to the drinking age</a>.',
    ].join('\n\n'),
    nights: bookable(ys), nightsTitle: '18+ nights to book', venues: vs.map((x) => x.v.id),
    sections: [
      { h2: 'Where the 18+ nights are', paras: ys.length ? vs.map((x) => `${venueLink(x.v)} in ${esc(area(x.v))}: ${list(x.nights.map((p) => `${partyLink(p)} on ${short(p.night_date)} (${p.age_min}+, ${p.event_status === 'sold_out' ? 'sold out' : price(p)})`))}.`) : ['No 18+ nights are listed right now. The 21+ list is on the parties page.'] },
      { h2: 'How 18+ nights work', paras: [
        `The limit is per night: a venue that hosts an 18+ party one night can be 21+ the next, so check the age on each party page (it is on every card on this site). ${a('/blog/drinking-age-in-nyc', 'The drinking age in NYC')} explains which IDs bars accept.`,
        'Under-21s cannot buy or be served alcohol anywhere in New York, and a fake ID is a crime. Expect an ID check at the door and the same security as any club night.',
      ] },
      { h2: 'If you are 21 or over', paras: [
        `Everything else is open to you: ${listLink(c, 'tonight', 'parties tonight')}, ${a('/blog/best-clubs-in-nyc', 'the best clubs in NYC')} and ${listLink(c, '21-plus', '21+ parties')}.`,
      ] },
    ],
    faq: [
      { q: 'Are there 18+ clubs in NYC?', a: ys.length ? `Yes, a few nights: ${ys.length} of the ${st.n} upcoming nights on our list are open to under-21s.` : `Not right now on our list: every upcoming night we track is 21+.` },
      { q: 'Can you drink at an 18+ club?', a: 'Only if you are 21 or over. The drinking age in New York is 21; under-21s are often marked with a wristband or stamp at the door.' },
      { q: 'What ID do I need?', a: 'A valid government photo ID: a U.S. or Canadian driver\'s license or ID card, a passport from any country, or a U.S. military ID.' },
      { q: 'Who sets the age limit?', a: 'The party does, night by night, and it is printed on the ticket page. The same venue can be 18+ one night and 21+ the next.' },
    ],
    table: 'nights:young', tableTitle: 'Every 18+ night we list', minRows: 1,
    method: `Read on ${TODAY_LINE(c)} from the age limit on each party's ticket page, for every upcoming night on the site, and recomputed daily.`,
    related: [['Drinking age in NYC', '/blog/drinking-age-in-nyc'], ['18+ parties', '/parties/18-plus'], ['Parties tonight', '/parties/tonight'], ['Best clubs in NYC', '/blog/best-clubs-in-nyc']],
  };
}

// ---------- this weekend ----------
function weekendNights(c: Ctx) {
  const dw = weekday(c.today);
  // Friday to Sunday: this one while it lasts (from Friday to Sunday), else the next
  const fri = dw === 5 ? c.today : dw === 6 ? addDays(c.today, -1) : dw === 0 ? addDays(c.today, -2) : addDays(c.today, 5 - dw);
  const sun = addDays(fri, 2);
  return { fri, sun, ps: c.parties.filter((p) => p.night_date >= fri && p.night_date <= sun && p.night_date >= c.today) };
}
function weekendGuide(c: Ctx): Guide | null {
  const { fri, sun, ps } = weekendNights(c);
  if (!ps.length) return null;
  const st = nightStats(ps);
  const vs = venueStats(ps, c.venues);
  const dates = [fri, addDays(fri, 1), sun].filter((d) => d >= c.today);
  const perDay = dates.map((d) => [d, ps.filter((p) => p.night_date === d)] as const);
  const hhs = c.bars.filter((b) => b.dealKnown && !b.doubt && b.windows.some((w) => w.days.includes('fri') || w.days.includes('sat') || w.days.includes('sun')));
  const sat = c.bars.filter((b) => b.windows.some((w) => w.days.includes('sat'))).length, sunN = c.bars.filter((b) => b.windows.some((w) => w.days.includes('sun'))).length;
  const THEME: Record<string, [string, string]> = { halloween: ['Halloween', '/parties/halloween'], nye: ["New Year's Eve", '/parties/new-years-eve'], thanksgiving: ['Thanksgiving', '/parties/thanksgiving-weekend'] };
  const themes = [...ps.reduce((m, p) => { for (const t of p.themes) if (THEME[t]) m.set(t, (m.get(t) ?? 0) + 1); return m; }, new Map<string, number>())];
  const range = `${nightDate(fri, { month: 'short', day: 'numeric' })} to ${nightDate(sun, { month: 'short', day: 'numeric' })}`;
  const cheap = ps.filter((p) => p.price_status === 'free' || (p.price_from !== null && p.price_from <= 25));
  return {
    slug: 'things-to-do-in-nyc-this-weekend', status: 'published', published: '2026-10-30', updated: c.today,
    title: `Things to Do in NYC This Weekend (${range})`, h1: `Things to do in NYC this weekend: ${range}`, short: 'This weekend in NYC', keyword: 'things to do in nyc this weekend',
    description: fit(`Things to do in NYC this weekend, ${range}: ${st.n} parties, the happy hours running Friday to Sunday and the cheap nights, updated every day.`),
    answer: `This weekend (${range}) we list ${st.n} parties in NYC: ${list(perDay.filter(([, x]) => x.length).map(([d, x]) => `${x.length} on ${WEEKDAY[weekday(d)]}`))}. ${themes.length ? `${cap(list(themes.map(([t, n]) => `${n} ${THEME[t][0]} ${n === 1 ? 'night' : 'nights'}`)))} among them. ` : ''}The biggest venue lineups are at ${list(vs.slice(0, 3).map((x) => x.v.name))}; ${cheap.length ? `${plural(cheap.length, 'night costs', 'nights cost')} $25 or less` : 'tickets vary'}, and ${hhs.length} bars run a happy hour from Friday to Sunday.`,
    intro: [
      `The weekend in NYC, from the data we refresh every day: every party on the calendar from Friday to Sunday, the happy hours to start with, and the cheap nights. Updated ${TODAY_LINE(c)}, so what you see is what is on sale now.`,
    ].join('\n\n'),
    nights: bookable(ps, 8), nightsTitle: 'This weekend\'s nights to book', venues: vs.slice(0, 6).map((x) => x.v.id),
    sections: [
      ...perDay.filter(([, x]) => x.length).map(([d, x]) => {
        const s = nightStats(x), v = venueStats(x, c.venues);
        return { h2: `${WEEKDAY[weekday(d)]}, ${nightDate(d, { month: 'long', day: 'numeric' })}`, paras: [
          `${plural(x.length, 'party', 'parties')} at ${plural(v.length, 'venue')}${s.start !== null ? `, typically starting around ${clock(s.start)}` : ''}${s.prices.length ? `; tickets from ${money(s.low!)}` : ''}. ${s.genres.length ? `Most played: ${list(s.genres.slice(0, 3).map(([g]) => genreName(g).toLowerCase()))}.` : ''}`,
          `Picks from the busiest venues: ${list(v.slice(0, 4).map((y) => `${partyLink(y.nights[0])} at ${venueLink(y.v)}${y.nights[0].event_status === 'sold_out' ? ' (sold out)' : ` (${price(y.nights[0])})`}`))}. ${c.dates.has(d) ? `All of them: ${a(`/parties/date/${d}`, `parties on ${WEEKDAY[weekday(d)]}`)}.` : ''}`,
        ] };
      }),
      { h2: 'Start with a happy hour', paras: [
        `${sat} bars on our list run a happy hour on Saturday and ${sunN} on Sunday, more than you would guess. ${a('/blog/best-weekend-happy-hours-nyc', 'The best weekend happy hours')} has them cheapest first, and every party page lists the happy hours closest to the venue.`,
        `Free and cheap: ${cheap.length ? `${plural(cheap.length, 'night', 'nights')} this weekend cost $25 or less to get in` : 'few nights this weekend are cheap'}; see ${listLink(c, 'free', 'free parties')} and ${a('/blog/free-things-to-do-in-nyc-at-night', 'free things to do at night')}.`,
      ] },
      { h2: 'Before you go', paras: RULES(c) },
    ],
    faq: [
      { q: 'What is there to do in NYC this weekend?', a: `We list ${st.n} parties from ${range}, plus ${hhs.length} bars with a weekend happy hour. The full list is in the table on this page.` },
      { q: 'What are the best parties this weekend?', a: `The venues with the most nights this weekend are ${list(vs.slice(0, 3).map((x) => `${x.v.name} (${x.nights.length})`))}.` },
      ...(cheap.length ? [{ q: 'Are there cheap things to do this weekend?', a: `${plural(cheap.length, 'party costs', 'parties cost')} $25 or less to get in this weekend, and weekend happy hours run on both days.` }] : []),
      { q: 'How often is this updated?', a: 'Every day: the parties come from the ticket pages we read daily, and nights that are over drop off.' },
    ],
    table: 'nights:weekend', tableTitle: 'Every party this weekend',
    method: `Computed on ${TODAY_LINE(c)} from the published nights on the site for ${range} and the happy hours bars list on their own sites, recomputed daily.`,
    related: [['Parties this weekend', '/parties/this-weekend'], ['Parties tonight', '/parties/tonight'], ['Weekend happy hours', '/blog/best-weekend-happy-hours-nyc'], ['NYC nightlife guide', '/blog/nyc-nightlife-guide']],
  };
}

// ---------- December ----------
const decemberYear = (c: Ctx) => c.today.slice(0, 4);
async function decemberGuide(c: Ctx): Promise<Guide | null> {
  const y = decemberYear(c);
  if (c.today > `${y}-12-31`) return null;
  const ps = c.parties.filter((p) => p.night_date.startsWith(`${y}-12`));
  if (!ps.length) return null;
  const { partyLists } = await import('./partyLists');
  const lists = await partyLists();
  const count = (slug: string) => lists.find((l) => l.slug === slug)?.parties.filter((p) => p.night_date.startsWith(`${y}-12`)).length ?? 0;
  const st = nightStats(ps);
  const vs = venueStats(ps, c.venues);
  const fridays = [...new Set(ps.map((p) => p.night_date))].filter((d) => [5, 6].includes(weekday(d))).map((d) => [d, ps.filter((p) => p.night_date === d).length] as const).sort((a2, b) => b[1] - a2[1]);
  const xmas = `${y}-12-25`, nye = `${y}-12-31`;
  const H: [string, string, number][] = [['christmas', 'Christmas and holiday parties', count('christmas')], ['hanukkah', 'Hanukkah parties', count('hanukkah')], ['santacon', 'SantaCon bar crawls', count('santacon')], ['new-years-eve', "New Year's Eve parties", count('new-years-eve')]];
  return {
    slug: 'things-to-do-in-nyc-in-december', status: 'published', published: '2026-10-30', updated: c.today,
    title: `Things to Do in NYC in December ${y}: Parties and Bars`, h1: `Things to do in NYC in December ${y}: the nights out, week by week`, short: 'December in NYC', keyword: 'things to do in nyc in december',
    description: fit(`Things to do in NYC in December ${y}: ${st.n} parties on sale so far, Christmas and New Year's Eve nights, holiday bars and happy hours, updated daily.`),
    answer: `December ${y} in NYC already has ${st.n} parties on sale on our list, with more added every week. Christmas falls on a ${WEEKDAY[weekday(xmas)]} and New Year's Eve on a ${WEEKDAY[weekday(nye)]}${count('new-years-eve') ? `, with ${count('new-years-eve')} New Year's Eve parties listed so far` : ''}. ${fridays.length ? `The busiest night so far is ${long(fridays[0][0])} (${fridays[0][1]} parties).` : ''}`,
    intro: [
      'December is one of the big months for going out in New York: office parties, holiday bars, friends home for the holidays and New Year\'s Eve at the end. This guide follows what is actually on sale, from the ticket pages we read every day, so it fills in as promoters announce their nights.',
      `Updated ${TODAY_LINE(c)}. For the holiday pop-up bars, see <a href="/blog/christmas-bars-nyc-2026">our Christmas bars guide</a>; for the last night of the year, <a href="/blog/new-years-eve-nyc-2026">our New Year's Eve guide</a>.`,
    ].join('\n\n'),
    nights: bookable(ps, 8), nightsTitle: 'December nights to book', venues: vs.slice(0, 6).map((x) => x.v.id),
    sections: [
      { h2: 'The holiday nights', paras: [
        [H.some(([, , n]) => n) ? `On our list for December so far: ${list(H.filter(([, , n]) => n).map(([slug, label, n]) => `${listLink(c, slug, label)} (${n})`))}.` : '', H.some(([, , n]) => !n) ? `${cap(list(H.filter(([, , n]) => !n).map(([slug, label]) => listLink(c, slug, label))))} have not gone on sale on our list yet; their pages fill in as they do.` : ''].filter(Boolean).join(' '),
        `Christmas Day is a ${WEEKDAY[weekday(xmas)]} this year; ${listLink(c, 'christmas-eve', 'Christmas Eve parties')} and ${listLink(c, 'christmas', 'holiday parties')} are listed as they go on sale. New Year's Eve is a ${WEEKDAY[weekday(nye)]}: ${a('/blog/new-years-eve-nyc-2026', 'our New Year\'s Eve guide')} has the nights by kind, and ${listLink(c, 'new-years-day', 'New Year\'s Day parties')} pick up after.`,
        `Holiday pop-up bars are in ${a('/blog/christmas-bars-nyc-2026', 'Christmas bars NYC')}.`,
      ] },
      { h2: 'Week by week', paras: [
        `The biggest weekend nights so far: ${list(fridays.slice(0, 5).map(([d, n]) => `${dateLink(c, d, short(d))} (${n})`))}. Date pages go live two weeks ahead; until then the nights are on the ${a('/parties', 'parties page')}.`,
        `The venues with the most December nights on sale are ${list(vs.slice(0, 5).map((x) => `${venueLink(x.v)} (${x.nights.length})`))}. ${a('/blog/best-clubs-in-nyc', 'The best clubs in NYC')} ranks them for the month ahead.`,
      ] },
      { h2: 'By sound', paras: [
        `December's most booked sounds so far: ${list(st.genres.slice(0, 6).map(([g, n]) => `${listLink(c, g, genreName(g).toLowerCase())} (${n})`))}.${st.prices.length ? ` Tickets start at ${money(st.low!)}; the typical lowest price is ${money(st.med!)}.` : ''}`,
      ] },
      { h2: 'Happy hours in the cold', paras: [
        `Happy hours keep running through the holidays, though a bar can change its hours around Christmas and New Year's: check the bar's page before you go. Start with ${a('/happy-hours/now', 'happy hours on right now')}, ${a('/blog/cheapest-happy-hours-nyc', 'the cheapest ones')} or, for a group, ${a('/blog/team-happy-hour-nyc', 'a team happy hour')} for the office party.`,
      ] },
      { h2: 'Before you go', paras: RULES(c) },
    ],
    faq: [
      { q: `What is there to do in NYC in December ${y}?`, a: `At night: ${st.n} parties are on sale for December on our list so far, including ${list(H.filter(([, , n]) => n).map(([, label, n]) => `${n} ${label.toLowerCase().replace(/^new year's/, "New Year's").replace(/^hanukkah/, 'Hanukkah').replace(/^christmas/, 'Christmas').replace(/santacon/i, 'SantaCon')}`))}.` },
      { q: `What day is Christmas ${y}?`, a: `${long(xmas)}.` },
      { q: `What day is New Year's Eve ${y}?`, a: `${long(nye)}.` },
      ...(fridays.length ? [{ q: 'Which December night has the most parties?', a: `So far, ${long(fridays[0][0])}, with ${fridays[0][1]} parties on our list.` }] : []),
    ],
    table: 'nights:december', tableTitle: `December ${y} nights on sale`,
    method: `Computed on ${TODAY_LINE(c)} from the published December nights on the site; holiday counts use the same rules as the holiday party pages. Recomputed daily, so the numbers grow as nights go on sale.`,
    related: [["New Year's Eve in NYC", '/blog/new-years-eve-nyc-2026'], ['Christmas bars', '/blog/christmas-bars-nyc-2026'], ['Christmas parties', '/parties/christmas'], ["New Year's Eve parties", '/parties/new-years-eve'], ['Things to do in November', '/blog/things-to-do-in-nyc-in-november']],
  };
}

// ---------- best happy hours ----------
const FRESH = () => Date.now() - 30 * 864e5;
function scoredBars(c: Ctx) {
  // the same holds as the cheapest-happy-hours guide: prices under $2 and two offers wait for a person to confirm them
  const REVIEW = new Set(['ben-jack-s-steakhouse-flatiron', 'mile-17-upper-east-side']);
  const ok = c.bars.filter((b) => b.dealKnown && !b.doubt && b.onMap && b.checked && Date.parse(b.checked) >= FRESH() && b.windows.length && !REVIEW.has(b.slug) && (b.cheapestDrink === null || b.cheapestDrink >= 2));
  return ok.map((b) => ({ b, s: (b.cheapestDrink !== null ? Math.max(0, 12 - b.cheapestDrink) * 10 : 0) + b.days.length * 6 + (b.hasFood ? 10 : 0) + (b.weekend ? 8 : 0) + (b.late ? 5 : 0) + Math.min(6, b.offers.length) * 3 }))
    .sort((x, y) => y.s - x.s || x.b.name.localeCompare(y.b.name));
}
function bestHappyHours(c: Ctx): Guide | null {
  const all = scoredBars(c);
  if (all.length < 10) return null;
  const seen = new Set<string>(), picks: Bar[] = [];
  // one per neighborhood, and one branch per chain
  for (const { b } of all) { if (seen.has(b.hoodSlug) || seen.has(b.name)) continue; seen.add(b.hoodSlug); seen.add(b.name); picks.push(b); if (picks.length >= 10) break; }
  const boroughs = [...new Set(picks.map((b) => b.borough).filter(Boolean))] as string[];
  const why = (b: Bar) => { const its = [...new Set(b.offers.filter((o) => tidy(o.item) && tidy(o.item).length <= 40).slice(0, 4).map((o) => `${o.price} ${tidy(o.item).toLowerCase()}`))]; return [
    `${b.name} runs its happy hour ${b.days.length === 7 ? 'every day' : `${plural(b.days.length, 'day')} a week`} (${scheduleLabel(b)}).`,
    its.length ? `The deal: ${list(its)}.` : '',
    b.cheapestDrink !== null ? `Its cheapest drink is ${money(b.cheapestDrink)}${b.cheapestDrink <= 6 ? ', which puts it on our list of drinks $6 and under' : ''}.` : '',
    b.hasFood ? 'There is food on the happy-hour menu too.' : '',
    b.weekend ? 'It also runs on the weekend.' : '', b.late ? 'There is a late-night window as well.' : '',
  ].filter(Boolean).join(' '); };
  return {
    slug: 'best-happy-hours-in-nyc', status: 'published', published: '2026-10-30', updated: c.today,
    title: 'The Best Happy Hours in NYC, Scored on Price and Hours', h1: 'The best happy hours in NYC, scored on price, hours and food', short: 'Best happy hours', keyword: 'best happy hours in nyc',
    description: fit(`The best happy hours in NYC: ${all.length} deals read on the bars' own sites in the last 30 days, scored on drink price, days, food and weekend hours.`),
    answer: `The best happy hours in NYC on our scores right now: ${list(picks.slice(0, 5).map((b) => `${b.name} in ${b.hood} (${b.cheapestDrink !== null ? `drinks from ${money(b.cheapestDrink)}, ` : ''}${scheduleLabel(b).split(' · ')[0].replace(/^Daily/, 'daily')})`))}. We scored the ${all.length} happy hours whose deals we read on the bar's own site in the last 30 days, on drink price, days a week, food and weekend or late hours, one pick per neighborhood.`,
    intro: [
      'A good happy hour is cheap, runs often, and has something to eat. Those are things we can measure, so this list is scored rather than picked: every bar whose happy hour we read on its own site in the last 30 days gets points for a low drink price, for each day it runs, for food, and for a weekend or late-night window.',
      `To keep it useful across the city, the ten picks below are one per neighborhood (${list(boroughs)}). The cards show the live deal and hours; the table has the top 40 overall. Updated ${TODAY_LINE(c)}.`,
    ].join('\n\n'),
    picks: picks.map((b) => ({ slug: b.slug, why: why(b) })),
    sections: [
      { h2: 'How the score works', paras: [
        'Points come from the deal itself: up to 110 for a low drink price ($1 cheaper is 10 points), 6 for each day of the week it runs, 10 for food, 8 for a weekend window, 5 for a late-night window and 3 for each item on the deal (up to six). A bar whose deal we have not read in the last 30 days, or whose page showed different prices on our last re-check, is left out until it is read again.',
        `Nobody pays to be on this list: we do not sell placements. Where a bar's own site does not itemize the deal, it is not scored.`,
      ] },
      { h2: 'More ways to choose', paras: [
        `By price: ${a('/blog/cheapest-happy-hours-nyc', 'the cheapest happy hours by neighborhood')} and ${a('/happy-hours/cheap-drinks', 'drinks $6 and under')}. By food: ${a('/blog/cheap-happy-hour-food-nyc', 'cheap happy hour food')} and ${a('/blog/dollar-oysters-nyc', 'dollar oysters')}. By time: ${a('/blog/early-happy-hours-nyc', 'early happy hours')}, ${a('/blog/reverse-happy-hour-nyc', 'reverse happy hours')} and ${a('/blog/best-weekend-happy-hours-nyc', 'weekend happy hours')}. Or just ${a('/happy-hours/now', 'what is on right now')}.`,
        'Menu prices in NYC do not include the 8.875% sales tax, and the custom is to tip on the regular price. Some deals are served at the bar only.',
      ] },
    ],
    faq: [
      { q: 'What is the best happy hour in NYC?', a: `On our score, ${picks[0].name} in ${picks[0].hood}: ${dealLabel(picks[0])}, ${scheduleLabel(picks[0])}.` },
      { q: 'What time is happy hour in NYC?', a: 'Most often in the late afternoon into the early evening on weekdays; each bar sets its own hours, shown on its card. See what time is happy hour in NYC for the full breakdown.' },
      { q: 'How is this list made?', a: `From the deals bars publish on their own sites, read in the last 30 days: ${all.length} qualified, scored on price, days, food and weekend or late hours, one pick per neighborhood.` },
    ],
    table: 'top-hh', tableTitle: 'The top 40 happy hours in NYC',
    method: `Scored on ${TODAY_LINE(c)} from each bar's own published happy hour (read in the last 30 days), recomputed every time the site updates. Prices are menu prices before 8.875% tax and tip.`,
    related: [['NYC happy hours', '/happy-hours'], ['Happy hours right now', '/happy-hours/now'], ['Cheapest happy hours', '/blog/cheapest-happy-hours-nyc'], ['NYC nightlife guide', '/blog/nyc-nightlife-guide'], ['The happy hour map', '/map/happy-hours']],
  };
}

/**
 * The internal pages this build publishes that the guides link to. A link to anything else (a post that
 * did not build today, a list below its minimum) becomes plain text, so a guide never breaks the build.
 */
async function knownPaths(c: Ctx, own: Guide[]): Promise<Set<string>> {
  const { GUIDES } = await import('./guides');
  const { blogPosts } = await import('./data');
  const { autoGuides } = await import('./autoGuides');
  const { venuePages } = await partyData();
  return new Set([
    '/', '/blog', '/parties', '/parties/genres', '/happy-hours', '/happy-hours/now', '/trivia', '/map', '/map/happy-hours', '/map/parties', '/contact',
    ...[...GUIDES, ...(await autoGuides()), ...own].map((g) => `/blog/${g.slug}`), ...(await blogPosts()).map((p) => `/blog/${p.slug}`),
    ...[...c.lists].map((x) => `/parties/${x}`), ...[...c.hh].map((x) => `/happy-hours/${x}`), ...[...c.dates].map((d) => `/parties/date/${d}`),
    ...c.parties.map((p) => `/parties/${p.slug}`), ...venuePages.map((v) => `/parties/venue/${v.id}`), ...c.bars.map((b) => `/bars/${b.slug}`),
  ]);
}
const unlink = (t: string, ok: Set<string>) => t.replace(/<a href="(\/[^"]*)">(.*?)<\/a>/g, (m, href: string, text: string) => (ok.has(href) ? m : text));

let cache: Promise<Guide[]> | null = null;
export function nightGuides(): Promise<Guide[]> {
  cache ??= (async () => {
    const c = await ctx();
    const out = [
      ...CLUBS.map((s) => clubGuide(c, s)), nightlifeGuide(c), costGuide(c), youngGuide(c), weekendGuide(c), await decemberGuide(c), bestHappyHours(c),
    ].filter((g): g is Guide => !!g);
    const ok = await knownPaths(c, out);
    return out.map((g) => ({
      ...g, intro: g.intro && unlink(g.intro, ok),
      sections: g.sections.map((x) => ({ ...x, paras: x.paras.map((p) => unlink(p, ok)) })),
      related: g.related.filter(([, href]) => ok.has(href)),
    }));
  })();
  return cache;
}
