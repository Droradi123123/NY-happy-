/**
 * Party list pages under /parties/<slug>: music, day of the week, season and kind of party.
 * Built only above a minimum of upcoming nights (HappyTLV: THEME_MIN = 2, DAY_MIN = 3), so a
 * page never shows one lonely party. Each targets one search phrase (`keyword`).
 */
import { partyData, venueOf, GENRE_NAME, nightDate, type Party, type Venue } from './data';
import { partyTags } from './index';

export interface PartyList { slug: string; kind: 'genre' | 'day' | 'season' | 'tag' | 'when'; h1: string; label: string; keyword: string; short: string; parties: Party[]; title?: string; note?: string }

const GENRE_KW: Record<string, [string, string]> = { house: ['House Music', 'house music'], 'hip-hop': ['Hip-Hop', 'hip-hop'], 'r-and-b': ['R&B', 'r&b'], 'funk-soul': ['Funk & Soul', 'funk & soul'], edm: ['EDM', 'edm'], 'k-pop': ['K-Pop', 'k-pop'] };
const SEASONS: [string, string, string, string][] = [
  ['nye', 'new-years-eve', "New Year's Eve Parties in NYC", "new years eve parties nyc"],
  ['thanksgiving', 'thanksgiving-eve', 'Thanksgiving Eve Parties in NYC', 'thanksgiving eve parties nyc'],
  ['pride', 'pride', 'Pride Parties in NYC', 'pride parties nyc'],
  ['st-patricks', 'st-patricks-day', "St. Patrick's Day Parties in NYC", 'st patricks day parties nyc'],
];
const TAG_PAGES: [string, string, string, string, string][] = [
  ['lgbtq', 'queer', 'Queer and LGBTQ+ Parties in NYC', 'lgbtq parties nyc', 'LGBTQ+'],
  ['rooftop', 'rooftop', 'Rooftop Parties in NYC', 'rooftop parties nyc', 'Rooftop'],
  ['day', 'day-parties', 'Day Parties in NYC', 'day parties nyc', 'Day parties'],
  ['boat', 'boat-parties', 'Boat Parties in NYC', 'boat parties nyc', 'Boat'],
  ['openbar', 'open-bar', 'Open Bar Parties in NYC', 'open bar parties nyc', 'Open bar'],
  ['drag', 'drag', 'Drag Parties and Shows in NYC', 'drag parties nyc', 'Drag'],
];
// themes read from the party itself; each page is built only from THEME_MIN upcoming nights, so a new
// theme page is never thin. `title` = only the party's own title (for words that copy uses loosely)
const THEME_MIN = 5;
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
  ['season', 'christmas', 'Christmas and Holiday Parties in NYC', 'christmas parties nyc', 'Christmas', /christmas|xmas|holiday party|ugly sweater|santa ?con|jingle/i],
  ['season', 'hanukkah', 'Hanukkah Parties in NYC', 'hanukkah parties nyc', 'Hanukkah', /hanukk?ah|chanukk?ah|matzo ball/i],
  ['season', 'diwali', 'Diwali Parties in NYC', 'diwali parties nyc', 'Diwali', /diwali/i],
  ['season', 'friendsgiving', 'Friendsgiving Parties in NYC', 'friendsgiving parties nyc', 'Friendsgiving', /friendsgiving/i],
  ['season', 'day-of-the-dead', 'Day of the Dead Parties in NYC', 'day of the dead parties nyc', 'Day of the Dead', /d[ií]a de (los )?muertos|day of the dead/i],
];
const passes = (p: Party, test: Test, titleOnly = false) => typeof test === 'function' ? test(p) : test.test(titleOnly ? p.title : `${p.title} ${p.copy?.about ?? ''} ${p.copy?.expect ?? ''}`);
/** New York's date at build time, plus n days (the site rebuilds every few hours) */
function nyDate(n = 0) {
  const d = new Date(Date.now() + n * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const sentence = (t: string) => t.replace(/ Parties in NYC$/, ' parties in NYC').replace(/ Parties and Shows in NYC$/, ' parties and shows in NYC');

let cache: Promise<PartyList[]> | null = null;
export function partyLists(): Promise<PartyList[]> {
  cache ??= (async () => {
    const { parties, venues } = await partyData();
    const out: PartyList[] = [];
    const add = (l: Omit<PartyList, 'parties'>, list: Party[], min: number) => { if (list.length >= min) out.push({ ...l, parties: list }); };
    for (const [g, name] of Object.entries(GENRE_NAME)) {
      // headings in title case ("Afro House", "Drum & Bass"); the keyword stays lower case
      const [H, kw] = GENRE_KW[g] ?? [name.replace(/\b[a-z]/g, (c) => c.toUpperCase()), name.toLowerCase()];
      add({ slug: g, kind: 'genre', h1: `${H} Parties in NYC`, label: sentence(`${H} Parties in NYC`), keyword: `${kw} parties nyc`, short: name }, parties.filter((p) => p.genres.includes(g)), 2);
    }
    for (const [i, day] of WEEKDAY.entries()) {
      const D = day[0].toUpperCase() + day.slice(1);
      add({ slug: day, kind: 'day', h1: `${D} Night Parties in NYC`, label: `${D} night parties in NYC`, keyword: `${day} night parties nyc`, short: D },
        parties.filter((p) => new Date(`${p.night_date}T12:00:00Z`).getUTCDay() === i), 3);
    }
    for (const [theme, slug, h1, keyword] of SEASONS)
      add({ slug, kind: 'season', h1, label: sentence(h1), keyword, short: h1.replace(/ Parties in NYC$/, '') }, parties.filter((p) => p.themes.includes(theme)), 2);
    // tonight and this weekend: always built (a page that comes and goes would 404 for search engines);
    // when nothing is listed for tonight, the next night with parties is shown and said so
    const today = nyDate(), dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const tonight = parties.filter((p) => p.night_date === today);
    const next = tonight.length ? null : parties.find((p) => p.night_date > today)?.night_date ?? null;
    const shortDate = (d: string) => nightDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
    if (tonight.length || next) out.push({ slug: 'tonight', kind: 'when', h1: 'Parties Tonight in NYC', label: 'Parties tonight in NYC', keyword: 'parties tonight nyc', short: 'Tonight',
      title: `Parties Tonight in NYC: ${shortDate(today)}`,
      parties: tonight.length ? tonight : parties.filter((p) => p.night_date === next),
      ...(tonight.length ? {} : { note: next ? `Nothing is listed for tonight yet. These are the next parties, on ${shortDate(next)}.` : 'Nothing is listed for tonight yet.' }) });
    // Friday to Sunday nights: the coming weekend from Monday to Thursday, the rest of this one from Friday
    const from = dow >= 5 || dow === 0 ? today : nyDate(5 - dow), to = nyDate(dow === 0 ? 0 : 7 - dow);
    const weekend = parties.filter((p) => p.night_date >= from && p.night_date <= to);
    if (weekend.length) out.push({ slug: 'this-weekend', kind: 'when', h1: 'Parties This Weekend in NYC', label: 'Parties this weekend in NYC', keyword: 'parties this weekend nyc', short: 'This weekend',
      title: `Parties This Weekend in NYC: ${dateRange(weekend)} (${weekend.length} Parties)`, parties: weekend });
    for (const [kind, slug, h1, keyword, short, test, titleOnly] of THEMES)
      add({ slug, kind, h1, label: sentence(h1), keyword, short }, parties.filter((p) => passes(p, test, titleOnly)), THEME_MIN);
    for (const [tag, slug, h1, keyword, short] of TAG_PAGES)
      add({ slug, kind: 'tag', h1, label: sentence(h1), keyword, short }, parties.filter((p) => partyTags(p, venueOf(p, venues)).includes(tag)), 2);
    return out;
  })();
  return cache;
}
export const dateRange = (list: Party[]) => {
  const a = nightDate(list[0].night_date, { month: 'short', day: 'numeric' }), b = nightDate(list[list.length - 1].night_date, { month: 'short', day: 'numeric' });
  return a === b ? a : `${a} to ${b}`;
};
export type { Venue };
