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

export type ListKind = 'genre' | 'day' | 'season' | 'holiday' | 'tag' | 'age' | 'where' | 'when' | 'slice';
export interface Holiday { name: string; date: string; note: string }
export interface PartyList {
  slug: string; kind: ListKind; h1: string; label: string; keyword: string; short: string; parties: Party[]; title?: string; note?: string;
  /** asks search engines to index it (INDEX_MIN nights, or it already ranks) */
  indexable: boolean;
  /** when it has few nights: the closest ones (nearby genres, the whole borough...), and what they are */
  standIns: Party[]; standInLabel?: string;
  holiday?: Holiday;
  /** a slice (/parties/<parent>/<slice>): the page it narrows */
  parent?: { slug: string; short: string };
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
  ['season', 'santacon', 'SantaCon Bar Crawls and Parties in NYC', 'santacon nyc', 'SantaCon', /santa ?con|santa (bar )?crawl|santa pub crawl/i],
];
const passes = (p: Party, test: Test, titleOnly = false) => typeof test === 'function' ? test(p) : test.test(titleOnly ? p.title : `${p.title} ${p.copy?.about ?? ''} ${p.copy?.expect ?? ''}`);
/** New York's date at build time, plus n days (the site rebuilds every few hours) */
function nyDate(n = 0) {
  const d = new Date(Date.now() + n * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const sentence = (t: string) => t.replace(/ Boat Parties in /, ' boat parties in ').replace(/ Bar Crawls and Parties in /, ' bar crawls and parties in ').replace(/ Parties and Shows in /, ' parties and shows in ').replace(/ Parties in /, ' parties in ').replace(/ Raves in /, ' raves in ');

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
// days between two YYYY-MM-DD dates, and a party night within [from, to] days of the holiday's date
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);
const around = (p: Party, d: string, from: number, to: number) => { const x = dayDiff(p.night_date, d); return x >= from && x <= to; };
const said = (p: Party, re: RegExp) => re.test(`${p.title} ${p.copy?.about ?? ''}`);
/** Easter Sunday (anonymous Gregorian algorithm), for Mardi Gras */
const easter = (y: number) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return iso(y, mo, da); };
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
interface HolidayDef {
  slug: string; h1: string; keyword: string; short: string; name: string;
  /** the phrase slices are built from ("New Year's Eve") and its search form ("new years eve") */
  base: string; kw: string;
  at: (y: number) => string; note: (d: string) => string; match: (p: Party, d: string) => boolean;
}
const HOLIDAYS: HolidayDef[] = [
  { slug: 'thanksgiving-eve', h1: 'Thanksgiving Eve Parties in NYC', keyword: 'thanksgiving eve parties nyc', short: 'Thanksgiving Eve', name: 'Thanksgiving Eve', base: 'Thanksgiving Eve', kw: 'thanksgiving eve',
    at: (y) => iso(y, 11, nthDow(y, 11, 4, 4) - 1), note: (d) => `Thanksgiving Eve is ${fmt(d)}, the night before Thanksgiving, when people home for the holiday go out with old friends; it is one of the busiest bar nights of the year.`,
    match: (p, d) => p.themes.includes('thanksgiving') || p.night_date === d },
  { slug: 'thanksgiving-weekend', h1: 'Thanksgiving Weekend Parties in NYC', keyword: 'thanksgiving weekend parties nyc', short: 'Thanksgiving weekend', name: 'Thanksgiving weekend', base: 'Thanksgiving Weekend', kw: 'thanksgiving weekend',
    at: (y) => iso(y, 11, nthDow(y, 11, 4, 4)), note: (d) => `Thanksgiving is ${fmt(d)}; the long weekend runs to ${fmt(shift(d, 3))}, with Black Friday and two weekend nights out.`,
    match: (p, d) => around(p, d, 0, 3) },
  { slug: 'christmas', h1: 'Christmas and Holiday Parties in NYC', keyword: 'christmas parties nyc', short: 'Christmas', name: 'Christmas', base: 'Christmas', kw: 'christmas',
    at: (y) => iso(y, 12, 25), note: (d) => `Christmas is ${fmt(d)}. Holiday parties fill the weekends of December before it.`,
    match: (p) => said(p, /christmas|xmas|holiday party|ugly sweater|jingle/i) },
  { slug: 'christmas-eve', h1: 'Christmas Eve Parties in NYC', keyword: 'christmas eve parties nyc', short: 'Christmas Eve', name: 'Christmas Eve', base: 'Christmas Eve', kw: 'christmas eve',
    at: (y) => iso(y, 12, 24), note: (d) => `Christmas Eve is ${fmt(d)}. Many bars close early that night; the parties listed here are open.`,
    match: (p, d) => p.night_date === d },
  { slug: 'new-years-eve', h1: "New Year's Eve Parties in NYC", keyword: 'new years eve parties nyc', short: "New Year's Eve", name: "New Year's Eve", base: "New Year's Eve", kw: 'new years eve',
    at: (y) => iso(y, 12, 31), note: (d) => `New Year's Eve is ${fmt(d)}. Tickets for the big nights sell in price tiers that rise as the date gets closer.`,
    match: (p) => p.themes.includes('nye') },
  { slug: 'new-years-day', h1: "New Year's Day Parties in NYC", keyword: 'new years day parties nyc', short: "New Year's Day", name: "New Year's Day", base: "New Year's Day", kw: 'new years day',
    at: (y) => iso(y, 1, 1), note: (d) => `New Year's Day is ${fmt(d)}: day parties, recovery brunches and afters that run from the night before.`,
    match: (p, d) => p.night_date === d },
  { slug: 'mlk-weekend', h1: 'MLK Weekend Parties in NYC', keyword: 'mlk weekend parties nyc', short: 'MLK weekend', name: 'MLK Day', base: 'MLK Weekend', kw: 'mlk weekend',
    at: (y) => iso(y, 1, nthDow(y, 1, 1, 3)), note: (d) => `Martin Luther King Jr. Day is ${fmt(d)}, so the Saturday and Sunday before it are a long-weekend pair of nights out.`,
    match: (p, d) => around(p, d, -2, -1) },
  { slug: 'super-bowl', h1: 'Super Bowl Parties in NYC', keyword: 'super bowl parties nyc', short: 'Super Bowl', name: 'Super Bowl Sunday', base: 'Super Bowl', kw: 'super bowl',
    at: (y) => iso(y, 2, nthDow(y, 2, 0, 2)), note: (d) => `Super Bowl Sunday is on the second Sunday of February: ${fmt(d)}.`,
    match: (p) => said(p, /super ?bowl|big game watch/i) },
  { slug: 'valentines-day', h1: "Valentine's Day Parties in NYC", keyword: 'valentines day parties nyc', short: "Valentine's", name: "Valentine's Day", base: "Valentine's Day", kw: 'valentines day',
    at: (y) => iso(y, 2, 14), note: (d) => `Valentine's Day is ${fmt(d)}; Galentine's and anti-Valentine's parties run the nights around it.`,
    match: (p, d) => p.night_date === d || said(p, /valentine|galentine/i) },
  { slug: 'mardi-gras', h1: 'Mardi Gras Parties in NYC', keyword: 'mardi gras parties nyc', short: 'Mardi Gras', name: 'Mardi Gras', base: 'Mardi Gras', kw: 'mardi gras',
    at: (y) => shift(easter(y), -47), note: (d) => `Mardi Gras (Fat Tuesday) is ${fmt(d)}, 47 days before Easter; the parties run the weekend before it.`,
    match: (p) => said(p, /mardi gras|fat tuesday/i) },
  { slug: 'st-patricks-day', h1: "St. Patrick's Day Parties in NYC", keyword: 'st patricks day parties nyc', short: "St. Patrick's", name: "St. Patrick's Day", base: "St. Patrick's Day", kw: 'st patricks day',
    at: (y) => iso(y, 3, 17), note: (d) => `St. Patrick's Day is ${fmt(d)}. New York's parade runs up Fifth Avenue, and the bars around Midtown and the East Village fill from the afternoon.`,
    match: (p, d) => p.themes.includes('st-patricks') || p.night_date === d },
  { slug: 'cinco-de-mayo', h1: 'Cinco de Mayo Parties in NYC', keyword: 'cinco de mayo parties nyc', short: 'Cinco de Mayo', name: 'Cinco de Mayo', base: 'Cinco de Mayo', kw: 'cinco de mayo',
    at: (y) => iso(y, 5, 5), note: (d) => `Cinco de Mayo is ${fmt(d)}; Mexican bars and Latin parties mark it, often over the nearest weekend too.`,
    match: (p, d) => p.night_date === d || said(p, /cinco de mayo/i) },
  { slug: 'memorial-day-weekend', h1: 'Memorial Day Weekend Parties in NYC', keyword: 'memorial day weekend parties nyc', short: 'Memorial Day', name: 'Memorial Day', base: 'Memorial Day Weekend', kw: 'memorial day weekend',
    at: (y) => iso(y, 5, lastDow(y, 5, 1)), note: (d) => `Memorial Day is ${fmt(d)}, the unofficial start of summer: rooftops, boats and day parties run all weekend.`,
    match: (p, d) => around(p, d, -3, 0) },
  { slug: 'juneteenth', h1: 'Juneteenth Parties in NYC', keyword: 'juneteenth parties nyc', short: 'Juneteenth', name: 'Juneteenth', base: 'Juneteenth', kw: 'juneteenth',
    at: (y) => iso(y, 6, 19), note: (d) => `Juneteenth is ${fmt(d)}, a federal holiday marking the end of slavery in the United States.`,
    match: (p, d) => p.night_date === d || said(p, /juneteenth/i) },
  { slug: 'puerto-rican-day-parade', h1: 'Puerto Rican Day Parade Weekend Parties in NYC', keyword: 'puerto rican day parade parties nyc', short: 'Puerto Rican Day', name: 'the Puerto Rican Day Parade', base: 'Puerto Rican Day Parade', kw: 'puerto rican day parade',
    at: (y) => iso(y, 6, nthDow(y, 6, 0, 2)), note: (d) => `The National Puerto Rican Day Parade runs up Fifth Avenue on the second Sunday of June: ${fmt(d)}.`,
    match: (p, d) => said(p, /puerto ric|boricua/i) || (around(p, d, -2, 0) && p.genres.some((g) => g === 'latin' || g === 'reggaeton')) },
  { slug: 'pride', h1: 'Pride Parties in NYC', keyword: 'pride parties nyc', short: 'Pride', name: 'the NYC Pride March', base: 'Pride', kw: 'pride',
    at: (y) => iso(y, 6, lastDow(y, 6, 0)), note: (d) => `The NYC Pride March is on the last Sunday of June: ${fmt(d)}. The parties run all through Pride weekend and the month before it.`,
    match: (p) => p.themes.includes('pride') },
  { slug: 'july-4th', h1: '4th of July Parties in NYC', keyword: '4th of july parties nyc', short: 'July 4th', name: 'the 4th of July', base: '4th of July', kw: '4th of july',
    at: (y) => iso(y, 7, 4), note: (d) => `The 4th of July is ${fmt(d)}. Rooftops and boats with a view of the fireworks are the classic picks.`,
    match: (p, d) => around(p, d, -1, 0) || said(p, /4th of july|july 4(th)?\b|fourth of july|independence day/i) },
  { slug: 'labor-day', h1: 'Labor Day Weekend Parties in NYC', keyword: 'labor day parties nyc', short: 'Labor Day', name: 'Labor Day', base: 'Labor Day Weekend', kw: 'labor day weekend',
    at: (y) => iso(y, 9, nthDow(y, 9, 1, 1)), note: (d) => `Labor Day is ${fmt(d)}; the weekend before it is the last big weekend of summer, with day parties, rooftops and boats.`,
    match: (p, d) => around(p, d, -3, 0) || said(p, /labor day/i) },
  { slug: 'day-of-the-dead', h1: 'Day of the Dead Parties in NYC', keyword: 'day of the dead parties nyc', short: 'Day of the Dead', name: 'Día de los Muertos', base: 'Day of the Dead', kw: 'day of the dead',
    at: (y) => iso(y, 11, 2), note: (d) => `Día de los Muertos is celebrated on November 1 and 2 (this year's main day: ${fmt(d)}).`,
    match: (p) => said(p, /d[ií]a de (los )?muertos|day of the dead/i) },
];
// within a holiday (/parties/<holiday>/<slice>) and a borough (/parties/<borough>/<slice>): one URL per
// narrower question ("rooftop new years eve parties nyc", "brooklyn parties friday night")
const RAVE_G = new Set(['techno', 'edm', 'drum-and-bass', 'trance', 'breaks']);
type Slice = { slug: string; h1: (base: string) => string; kw: (kw: string) => string; short: string; test: (p: Party, v: Venue | null) => boolean };
const HOLIDAY_SLICES: Slice[] = [
  ...(['Manhattan', 'Brooklyn', 'Queens'] as const).map((B) => ({ slug: B.toLowerCase(), short: B, h1: (b: string) => `${b} Parties in ${B}`, kw: (k: string) => `${k} parties ${B.toLowerCase()}`, test: (p: Party) => p.borough === B })),
  { slug: 'rooftop', short: 'Rooftop', h1: (b) => `Rooftop ${b} Parties in NYC`, kw: (k) => `rooftop ${k} parties nyc`, test: (p, v) => partyTags(p, v).includes('rooftop') },
  { slug: 'open-bar', short: 'Open bar', h1: (b) => `Open Bar ${b} Parties in NYC`, kw: (k) => `open bar ${k} parties nyc`, test: (p, v) => partyTags(p, v).includes('openbar') },
  { slug: 'boat', short: 'Boat parties', h1: (b) => `${b} Boat Parties in NYC`, kw: (k) => `${k} boat parties nyc`, test: (p, v) => partyTags(p, v).includes('boat') },
  { slug: 'lgbtq', short: 'LGBTQ+', h1: (b) => `Queer and LGBTQ+ ${b} Parties in NYC`, kw: (k) => `lgbtq ${k} parties nyc`, test: (p, v) => partyTags(p, v).includes('lgbtq') },
  { slug: 'free', short: 'Free', h1: (b) => `Free ${b} Parties in NYC`, kw: (k) => `free ${k} parties nyc`, test: (p) => p.price_status === 'free' },
  { slug: 'under-50', short: 'Under $50', h1: (b) => `Cheap ${b} Parties in NYC: Under $50`, kw: (k) => `cheap ${k} parties nyc`, test: (p) => p.price_status === 'free' || (p.price_from !== null && p.price_from <= 50) },
  { slug: 'raves', short: 'Raves', h1: (b) => `${b} Raves in NYC: Techno, EDM and Drum & Bass`, kw: (k) => `${k} raves nyc`, test: (p) => p.genres.some((g) => RAVE_G.has(g)) || /\brave\b/i.test(p.title) },
  { slug: 'latin', short: 'Latin', h1: (b) => `Latin and Reggaeton ${b} Parties in NYC`, kw: (k) => `latin ${k} parties nyc`, test: (p) => p.genres.some((g) => g === 'latin' || g === 'reggaeton') },
  { slug: 'hip-hop', short: 'Hip-hop', h1: (b) => `Hip-Hop and R&B ${b} Parties in NYC`, kw: (k) => `hip-hop ${k} parties nyc`, test: (p) => p.genres.some((g) => g === 'hip-hop' || g === 'r-and-b') },
  { slug: 'house', short: 'House', h1: (b) => `House Music ${b} Parties in NYC`, kw: (k) => `house music ${k} parties nyc`, test: (p) => p.genres.some((g) => g === 'house' || g === 'afro-house' || g === 'disco') },
];
const BOROUGH_GENRES: [string, string, string][] = [['techno', 'Techno', 'techno'], ['house', 'House Music', 'house music'], ['latin', 'Latin', 'latin'], ['reggaeton', 'Reggaeton', 'reggaeton'], ['hip-hop', 'Hip-Hop', 'hip-hop'], ['afrobeats', 'Afrobeats', 'afrobeats'], ['disco', 'Disco', 'disco']];
const AGES: [slug: string, h1: string, keyword: string, short: string, min: number][] = [
  ['21-plus', '21+ Parties in NYC', '21+ parties nyc', '21+', 21],
  ['25-plus', '25+ Parties in NYC', '25+ parties nyc', '25+', 25],
  ['30-plus', '30+ Parties in NYC', '30+ parties nyc', '30+', 30],
];
const BOROUGHS: [string, string][] = [['manhattan', 'Manhattan'], ['brooklyn', 'Brooklyn'], ['queens', 'Queens'], ['bronx', 'The Bronx'], ['staten-island', 'Staten Island']];
// list slugs that belong to other pages under /parties
const RESERVED = new Set(['halloween', 'venue', 'date', 'genres', 'tonight', 'this-weekend', 'artist', 'promoter']);

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
    for (const H of HOLIDAYS) {
      const date = next(today, H.at);
      const list = parties.filter((p) => H.match(p, date));
      add({ slug: H.slug, kind: 'holiday', h1: H.h1, label: sentence(H.h1), keyword: H.keyword, short: H.short, holiday: { name: H.name, date, note: H.note(date) }, standIns: weekend.length ? weekend : parties, standInLabel: weekend.length ? 'Parties this weekend' : 'Coming up in NYC' }, list);
      const parent = { slug: H.slug, short: H.short };
      for (const S of HOLIDAY_SLICES)
        add({ slug: `${H.slug}/${S.slug}`, kind: 'slice', parent, h1: S.h1(H.base), label: sentence(S.h1(H.base)), keyword: S.kw(H.kw), short: S.short, holiday: { name: H.name, date, note: H.note(date) },
          standIns: list.length ? list : weekend.length ? weekend : parties, standInLabel: list.length ? `All ${H.short} parties` : weekend.length ? 'Parties this weekend' : 'Coming up in NYC' }, list.filter((p) => S.test(p, venueOf(p, venues))));
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
    for (const [slug, B] of BOROUGHS) {
      const inB = parties.filter((p) => p.borough === B), bk = B.replace(/^The /, '').toLowerCase(), parent = { slug, short: B };
      add({ slug, kind: 'where', h1: `Parties in ${B}`, label: `Parties in ${B}`, keyword: `${bk} parties`, short: B, standIns: parties, standInLabel: 'Coming up elsewhere in NYC' }, inB);
      // borough by night: "brooklyn parties friday night", tonight, this weekend, and its main sounds
      for (const [i, day] of WEEKDAY.entries()) {
        const D = day[0].toUpperCase() + day.slice(1);
        const list = inB.filter((p) => new Date(`${p.night_date}T12:00:00Z`).getUTCDay() === i);
        add({ slug: `${slug}/${day}`, kind: 'slice', parent, h1: `${D} Night Parties in ${B}`, label: `${D} night parties in ${B}`, keyword: `${bk} parties ${day} night`, short: D,
          ...(list[0] ? { title: `${D} Night Parties in ${B}: ${nightDate(list[0].night_date, { month: 'short', day: 'numeric' })} (${list.length})` } : {}),
          standIns: parties.filter((p) => new Date(`${p.night_date}T12:00:00Z`).getUTCDay() === i), standInLabel: `${D} nights elsewhere in NYC` }, list);
      }
      const tonightB = inB.filter((p) => p.night_date === today);
      add({ slug: `${slug}/tonight`, kind: 'slice', parent, h1: `Parties Tonight in ${B}`, label: `Parties tonight in ${B}`, keyword: `parties tonight ${bk}`, short: 'Tonight',
        title: `Parties Tonight in ${B}: ${shortDate(today)}`, standIns: tonight, standInLabel: 'Tonight elsewhere in NYC' }, tonightB);
      add({ slug: `${slug}/this-weekend`, kind: 'slice', parent, h1: `Parties This Weekend in ${B}`, label: `Parties this weekend in ${B}`, keyword: `${bk} parties this weekend`, short: 'This weekend',
        ...(weekend.length ? { title: `Parties This Weekend in ${B}: ${dateRange(weekend)}` } : {}), standIns: weekend, standInLabel: 'This weekend elsewhere in NYC' }, inB.filter((p) => weekend.includes(p)));
      for (const [g, G, gk] of BOROUGH_GENRES)
        add({ slug: `${slug}/${g}`, kind: 'slice', parent, h1: `${G} Parties in ${B}`, label: `${G} parties in ${B}`, keyword: `${gk} parties ${bk}`, short: GENRE_NAME[g] ?? G,
          standIns: parties.filter((p) => p.genres.includes(g)), standInLabel: `${GENRE_NAME[g] ?? G} elsewhere in NYC` }, inB.filter((p) => p.genres.includes(g)));
    }
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
