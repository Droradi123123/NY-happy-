/**
 * Party list pages under /parties/<slug>, one URL per search intent: music, night of the week, holiday
 * and season, kind of party, age, borough and neighborhood, tonight and this weekend.
 * Oct 29, 2026: every intent page is always built, so its URL never turns into a 404 when its nights
 * run out (HappyTLV: a genre page that came and went lost its rankings). A page asks to be indexed only
 * with INDEX_MIN upcoming nights, or when it already had Google impressions (lib/indexScope.ts); below
 * that it shows the closest matches (`standIns`) and stays "noindex, follow". Each targets one search
 * phrase (`keyword`).
 */
import { partyData, venueOf, GENRE_NAME, nightDate, slugify, type Party, type Venue } from './data';
import { partyTags } from './index';
import { pathKept } from './indexScope';

export type ListKind = 'genre' | 'day' | 'season' | 'holiday' | 'tag' | 'age' | 'where' | 'when';
export interface Holiday { name: string; date: string; note: string }
export interface PartyList {
  slug: string; kind: ListKind; h1: string; label: string; keyword: string; short: string; parties: Party[]; title?: string; note?: string;
  /** asks search engines to index it (INDEX_MIN nights, or it already ranks) */
  indexable: boolean;
  /** when it has few nights: the closest ones (nearby genres, the whole borough...), and what they are */
  standIns: Party[]; standInLabel?: string;
  holiday?: Holiday;
}
export const INDEX_MIN = 5;

const GENRE_KW: Record<string, [string, string]> = { house: ['House Music', 'house music'], 'hip-hop': ['Hip-Hop', 'hip-hop'], 'r-and-b': ['R&B', 'r&b'], 'funk-soul': ['Funk & Soul', 'funk & soul'], edm: ['EDM', 'edm'], 'k-pop': ['K-Pop', 'k-pop'] };
const TAG_PAGES: [string, string, string, string, string][] = [
  ['lgbtq', 'queer', 'Queer and LGBTQ+ Parties in NYC', 'lgbtq parties nyc', 'LGBTQ+'],
  ['rooftop', 'rooftop', 'Rooftop Parties in NYC', 'rooftop parties nyc', 'Rooftop'],
  ['day', 'day-parties', 'Day Parties in NYC', 'day parties nyc', 'Day parties'],
  ['boat', 'boat-parties', 'Boat Parties in NYC', 'boat parties nyc', 'Boat'],
  ['openbar', 'open-bar', 'Open Bar Parties in NYC', 'open bar parties nyc', 'Open bar'],
  ['drag', 'drag', 'Drag Parties and Shows in NYC', 'drag parties nyc', 'Drag'],
];
// themes read from the party itself (always built, indexed from INDEX_MIN nights).
// `titleOnly` = only the party's own title (for words copy uses loosely)
type Test = RegExp | ((p: Party) => boolean);
const THEMES: [kind: 'tag' | 'season', slug: string, h1: string, keyword: string, short: string, test: Test, titleOnly?: boolean][] = [
  ['tag', 'throwback', 'Throwback Parties in NYC', 'throwback parties nyc', 'Throwback',
    // the night itself says so (genre tags alone also catch '90s-style techno bills)
    /throwback|nostalgi|\by2k\b|\b(80s|90s|00s|2000s|2000's|2010s)\b|'(80|90)s|emo night|old ?school/i],
  ['tag', 'singles', 'Singles Parties and Speed Dating in NYC', 'singles parties nyc', 'Singles', /speed ?dating|\bsingles\b|dating mixer/i],
  ['tag', 'after-hours', 'After Hours Parties in NYC', 'after hours parties nyc', 'After hours', /after[- ]?hours|\bafters\b|until sunrise|till sunrise/i],
  ['tag', 'warehouse-raves', 'Warehouse Raves in NYC', 'warehouse raves nyc', 'Warehouse raves', /warehouse|\brave\b/i, true],
  ['tag', 'silent-disco', 'Silent Disco Parties in NYC', 'silent disco nyc', 'Silent disco', /silent disco/i],
  ['tag', 'brunch-parties', 'Brunch Parties in NYC', 'brunch parties nyc', 'Brunch parties', /brunch/i, true],
  ['tag', 'free', 'Free Parties in NYC', 'free parties nyc', 'Free', (p) => p.price_status === 'free'],
  ['tag', '18-plus', '18+ Parties in NYC', '18+ parties nyc', '18+', (p) => p.age_min !== null && p.age_min <= 18],
  ['tag', 'open-air', 'Open Air Parties in NYC', 'open air parties nyc', 'Open air', /open[- ]air|outdoors?\b|courtyard|garden party|in the park\b/i],
  ['tag', 'festivals', 'Music Festivals in NYC', 'music festivals nyc', 'Festivals', /festival|\bfest\b/i, true],
  ['season', 'hanukkah', 'Hanukkah Parties in NYC', 'hanukkah parties nyc', 'Hanukkah', /hanukk?ah|chanukk?ah|matzo ball/i],
  ['season', 'diwali', 'Diwali Parties in NYC', 'diwali parties nyc', 'Diwali', /diwali/i],
  ['season', 'friendsgiving', 'Friendsgiving Parties in NYC', 'friendsgiving parties nyc', 'Friendsgiving', /friendsgiving/i],
];
const passes = (p: Party, test: Test, titleOnly = false) => typeof test === 'function' ? test(p) : test.test(titleOnly ? p.title : `${p.title} ${p.copy?.about ?? ''} ${p.copy?.expect ?? ''}`);
/** New York's date at build time, plus n days (the site rebuilds every few hours) */
function nyDate(n = 0) {
  const d = new Date(Date.now() + n * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const sentence = (t: string) => t.replace(/ Parties in NYC$/, ' parties in NYC').replace(/ Parties and Shows in NYC$/, ' parties and shows in NYC');

// for a genre page with few nights: the genres closest in sound (general scene knowledge, no facts)
const GENRE_NEAR: Record<string, string[]> = {
  techno: ['house', 'electro', 'trance'], house: ['disco', 'techno', 'afro-house'], disco: ['house', 'funk-soul', '80s'], trance: ['techno', 'edm'],
  'drum-and-bass': ['breaks', 'garage', 'edm'], breaks: ['drum-and-bass', 'electro', 'garage'], afrobeats: ['amapiano', 'afro-house', 'dancehall'],
  amapiano: ['afro-house', 'afrobeats', 'house'], 'afro-house': ['amapiano', 'house', 'afrobeats'], latin: ['reggaeton', 'dancehall'],
  reggaeton: ['latin', 'dancehall', 'hip-hop'], 'hip-hop': ['r-and-b', 'dancehall', 'reggaeton'], 'r-and-b': ['hip-hop', 'funk-soul', 'afrobeats'],
  dancehall: ['afrobeats', 'reggaeton', 'hip-hop'], edm: ['trance', 'techno', 'drum-and-bass'], pop: ['k-pop', '2000s', 'emo'], emo: ['pop', '2000s', '90s'],
  '80s': ['90s', 'disco', 'pop'], '90s': ['2000s', '80s', 'hip-hop'], '2000s': ['90s', 'pop', 'emo'], 'k-pop': ['pop', 'edm', '2000s'],
  jazz: ['funk-soul', 'r-and-b', 'disco'], 'funk-soul': ['disco', 'r-and-b', 'jazz'], experimental: ['techno', 'electro', 'breaks'],
  electro: ['techno', 'breaks', 'experimental'], garage: ['drum-and-bass', 'house', 'breaks'],
};
// holidays: the date is computed (never typed in), the note is general knowledge about the night
const fmt = (d: string) => nightDate(d, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const nthDow = (y: number, m: number, wd: number, n: number) => { let d = 1; while (dow(y, m, d) !== wd) d++; return d + 7 * (n - 1); };
const lastDow = (y: number, m: number, wd: number) => { let d = new Date(Date.UTC(y, m, 0)).getUTCDate(); while (dow(y, m, d) !== wd) d--; return d; };
/** the next time a holiday falls on or after today (it stays "this year's" until the day after) */
const next = (today: string, at: (y: number) => string) => { const y = Number(today.slice(0, 4)); return at(y) >= today ? at(y) : at(y + 1); };
const HOLIDAYS: [theme: string | RegExp, slug: string, h1: string, keyword: string, short: string, name: string, at: (y: number) => string, note: (d: string) => string][] = [
  ['thanksgiving', 'thanksgiving-eve', 'Thanksgiving Eve Parties in NYC', 'thanksgiving eve parties nyc', 'Thanksgiving Eve', 'Thanksgiving Eve',
    (y) => iso(y, 11, nthDow(y, 11, 4, 4) - 1), (d) => `Thanksgiving Eve is ${fmt(d)}, the night before Thanksgiving, when people home for the holiday go out with old friends; it is one of the busiest bar nights of the year.`],
  ['nye', 'new-years-eve', "New Year's Eve Parties in NYC", 'new years eve parties nyc', "New Year's Eve", "New Year's Eve",
    (y) => iso(y, 12, 31), (d) => `New Year's Eve is ${fmt(d)}. Tickets for the big nights sell in price tiers that rise as the date gets closer.`],
  ['st-patricks', 'st-patricks-day', "St. Patrick's Day Parties in NYC", 'st patricks day parties nyc', "St. Patrick's", "St. Patrick's Day",
    (y) => iso(y, 3, 17), (d) => `St. Patrick's Day is ${fmt(d)}. New York's parade runs up Fifth Avenue, and the bars around Midtown and the East Village fill from the afternoon.`],
  ['pride', 'pride', 'Pride Parties in NYC', 'pride parties nyc', 'Pride', 'the NYC Pride March',
    (y) => iso(y, 6, lastDow(y, 6, 0)), (d) => `The NYC Pride March is on the last Sunday of June: ${fmt(d)}. The parties run all through Pride weekend and the month before it.`],
  [/4th of july|july 4(th)?\b|fourth of july|independence day/i, 'july-4th', '4th of July Parties in NYC', '4th of july parties nyc', 'July 4th', 'the 4th of July',
    (y) => iso(y, 7, 4), (d) => `The 4th of July is ${fmt(d)}. Rooftops and boats with a view of the fireworks are the classic picks.`],
  [/labor day/i, 'labor-day', 'Labor Day Weekend Parties in NYC', 'labor day parties nyc', 'Labor Day', 'Labor Day',
    (y) => iso(y, 9, nthDow(y, 9, 1, 1)), (d) => `Labor Day is ${fmt(d)}; the weekend before it is the last big weekend of summer, with day parties, rooftops and boats.`],
  [/christmas|xmas|holiday party|ugly sweater|santa ?con|jingle/i, 'christmas', 'Christmas and Holiday Parties in NYC', 'christmas parties nyc', 'Christmas', 'Christmas',
    (y) => iso(y, 12, 25), (d) => `Christmas is ${fmt(d)}. Holiday parties fill the weekends of December before it.`],
  [/d[ií]a de (los )?muertos|day of the dead/i, 'day-of-the-dead', 'Day of the Dead Parties in NYC', 'day of the dead parties nyc', 'Day of the Dead', 'Día de los Muertos',
    (y) => iso(y, 11, 2), (d) => `Día de los Muertos is celebrated on November 1 and 2 (this year's main day: ${fmt(d)}).`],
];
const AGES: [slug: string, h1: string, keyword: string, short: string, min: number][] = [
  ['21-plus', '21+ Parties in NYC', '21+ parties nyc', '21+', 21],
  ['25-plus', '25+ Parties in NYC', '25+ parties nyc', '25+', 25],
  ['30-plus', '30+ Parties in NYC', '30+ parties nyc', '30+', 30],
];
const BOROUGHS: [string, string][] = [['manhattan', 'Manhattan'], ['brooklyn', 'Brooklyn'], ['queens', 'Queens'], ['bronx', 'The Bronx'], ['staten-island', 'Staten Island']];
// list slugs that belong to other pages under /parties
const RESERVED = new Set(['halloween', 'venue', 'date', 'genres', 'tonight', 'this-weekend']);

let cache: Promise<PartyList[]> | null = null;
export function partyLists(): Promise<PartyList[]> {
  cache ??= (async () => {
    const { parties, venues, venuePages } = await partyData();
    const out: PartyList[] = [];
    const soon = (list: Party[], n = 6) => list.slice(0, n);
    const add = (l: Omit<PartyList, 'parties' | 'indexable' | 'standIns'> & { standIns?: Party[] }, list: Party[]) => {
      if (RESERVED.has(l.slug) && l.kind !== 'when') return;
      if (out.some((o) => o.slug === l.slug)) return;
      const indexable = l.kind === 'when' ? list.length > 0 : list.length >= INDEX_MIN || (list.length > 0 && pathKept(`/parties/${l.slug}`));
      const standIns = list.length >= INDEX_MIN ? [] : soon((l.standIns ?? []).filter((p) => !list.includes(p)));
      out.push({ ...l, parties: list, indexable, standIns });
    };
    const today = nyDate(), dowToday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const shortDate = (d: string) => nightDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
    // tonight and this weekend (when nothing is listed for tonight, the next night with parties, said so)
    const tonight = parties.filter((p) => p.night_date === today);
    const nextNight = tonight.length ? null : parties.find((p) => p.night_date > today)?.night_date ?? null;
    if (tonight.length || nextNight) add({ slug: 'tonight', kind: 'when', h1: 'Parties Tonight in NYC', label: 'Parties tonight in NYC', keyword: 'parties tonight nyc', short: 'Tonight',
      title: `Parties Tonight in NYC: ${shortDate(today)}`,
      ...(tonight.length ? {} : { note: nextNight ? `Nothing is listed for tonight yet. These are the next parties, on ${shortDate(nextNight)}.` : 'Nothing is listed for tonight yet.' }) },
      tonight.length ? tonight : parties.filter((p) => p.night_date === nextNight));
    // Friday to Sunday nights: the coming weekend from Monday to Thursday, the rest of this one from Friday
    const from = dowToday >= 5 || dowToday === 0 ? today : nyDate(5 - dowToday), to = nyDate(dowToday === 0 ? 0 : 7 - dowToday);
    const weekend = parties.filter((p) => p.night_date >= from && p.night_date <= to);
    if (weekend.length) add({ slug: 'this-weekend', kind: 'when', h1: 'Parties This Weekend in NYC', label: 'Parties this weekend in NYC', keyword: 'parties this weekend nyc', short: 'This weekend',
      title: `Parties This Weekend in NYC: ${dateRange(weekend)} (${weekend.length} Parties)` }, weekend);
    // music: every genre, always (joined genre strings are split upstream; "other" is never a page)
    for (const [g, name] of Object.entries(GENRE_NAME)) {
      // headings in title case ("Afro House", "Drum & Bass"); the keyword stays lower case
      const [H, kw] = GENRE_KW[g] ?? [name.replace(/\b[a-z]/g, (c) => c.toUpperCase()), name.toLowerCase()];
      const near = GENRE_NEAR[g] ?? [];
      add({ slug: g, kind: 'genre', h1: `${H} Parties in NYC`, label: sentence(`${H} Parties in NYC`), keyword: `${kw} parties nyc`, short: name,
        standIns: parties.filter((p) => !p.genres.includes(g) && p.genres.some((x) => near.includes(x))),
        standInLabel: near.length ? `Close in sound: ${near.map((x) => GENRE_NAME[x] ?? x).join(', ')}` : undefined }, parties.filter((p) => p.genres.includes(g)));
    }
    // nights of the week: the title names the next one ("Friday Night Parties in NYC: Oct 30")
    for (const [i, day] of WEEKDAY.entries()) {
      const D = day[0].toUpperCase() + day.slice(1);
      const list = parties.filter((p) => new Date(`${p.night_date}T12:00:00Z`).getUTCDay() === i);
      const first = list[0]?.night_date;
      add({ slug: day, kind: 'day', h1: `${D} Night Parties in NYC`, label: `${D} night parties in NYC`, keyword: `${day} night parties nyc`, short: D,
        ...(first ? { title: `${D} Night Parties in NYC: ${nightDate(first, { month: 'short', day: 'numeric' })} (${list.length} Parties)` } : {}),
        standIns: parties }, list);
    }
    // holidays: always up, with when it is and how many nights are on sale
    for (const [test, slug, h1, keyword, short, name, at, note] of HOLIDAYS) {
      const date = next(today, at);
      const list = parties.filter((p) => (typeof test === 'string' ? p.themes.includes(test) : passes(p, test)));
      add({ slug, kind: 'holiday', h1, label: sentence(h1), keyword, short, holiday: { name, date, note: note(date) }, standIns: weekend.length ? weekend : parties, standInLabel: weekend.length ? 'Parties this weekend' : 'Coming up in NYC' }, list);
    }
    for (const [kind, slug, h1, keyword, short, test, titleOnly] of THEMES)
      add({ slug, kind, h1, label: sentence(h1), keyword, short, standIns: parties, standInLabel: 'Coming up in NYC' }, parties.filter((p) => passes(p, test, titleOnly)));
    for (const [tag, slug, h1, keyword, short] of TAG_PAGES)
      add({ slug, kind: 'tag', h1, label: sentence(h1), keyword, short, standIns: parties, standInLabel: 'Coming up in NYC' }, parties.filter((p) => partyTags(p, venueOf(p, venues)).includes(tag)));
    // age: "21+" covers nearly every night; it is indexed only when it is not the whole party list again
    for (const [slug, h1, keyword, short, min] of AGES) {
      const list = parties.filter((p) => p.age_min !== null && p.age_min >= min);
      add({ slug, kind: 'age', h1, label: sentence(h1), keyword, short, standIns: parties.filter((p) => p.age_min !== null && p.age_min >= 21), standInLabel: '21+ nights coming up' }, list);
      if (min === 21 && list.length > 0.7 * parties.length) out[out.length - 1].indexable = false;
    }
    // where: the five boroughs, and every neighborhood with a club page (club pages stay between nights)
    for (const [slug, B] of BOROUGHS)
      add({ slug, kind: 'where', h1: `Parties in ${B}`, label: `Parties in ${B}`, keyword: `${B.replace(/^The /, '').toLowerCase()} parties`, short: B, standIns: parties, standInLabel: 'Coming up elsewhere in NYC' }, parties.filter((p) => p.borough === B));
    const hoods = [...new Set(venuePages.map((v) => v.neighborhood).filter(Boolean) as string[])].sort();
    for (const H of hoods) {
      const borough = venuePages.find((v) => v.neighborhood === H)?.borough ?? null;
      add({ slug: slugify(H), kind: 'where', h1: `Parties in ${H}`, label: `Parties in ${H}`, keyword: `${H.toLowerCase()} parties`, short: H,
        standIns: parties.filter((p) => borough && p.borough === borough), standInLabel: borough ? `Elsewhere in ${borough}` : undefined }, parties.filter((p) => (p.neighborhood ?? venueOf(p, venues)?.neighborhood) === H));
    }
    return out;
  })();
  return cache;
}
// ---------- one page per night: /parties/date/YYYY-MM-DD ----------
export interface DatePage { date: string; parties: Party[]; past: boolean; indexable: boolean; weekday: string }
export const DATE_AHEAD = 14, DATE_KEEP = 7;
/** the next 14 nights, and the 7 before today (still up, out of the sitemap; after that they 301 to the
 *  night of the week, scripts/ended-redirects.mjs). Indexed from INDEX_MIN parties. */
export async function datePages(): Promise<DatePage[]> {
  const { parties } = await partyData();
  const out: DatePage[] = [];
  for (let i = -DATE_KEEP; i < DATE_AHEAD; i++) {
    const date = nyDate(i);
    const list = parties.filter((p) => p.night_date === date);
    out.push({ date, parties: list, past: i < 0, indexable: i >= 0 && list.length >= INDEX_MIN, weekday: WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()] });
  }
  return out;
}
export const dateRange = (list: Party[]) => {
  if (!list.length) return '';
  const a = nightDate(list[0].night_date, { month: 'short', day: 'numeric' }), b = nightDate(list[list.length - 1].night_date, { month: 'short', day: 'numeric' });
  return a === b ? a : `${a} to ${b}`;
};
export type { Venue };
