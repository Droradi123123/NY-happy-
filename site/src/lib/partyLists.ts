/**
 * Party list pages under /parties/<slug>: music, day of the week, season and kind of party.
 * Built only above a minimum of upcoming nights (HappyTLV: THEME_MIN = 2, DAY_MIN = 3), so a
 * page never shows one lonely party. Each targets one search phrase (`keyword`).
 */
import { partyData, venueOf, GENRE_NAME, nightDate, type Party, type Venue } from './data';
import { partyTags } from './index';

export interface PartyList { slug: string; kind: 'genre' | 'day' | 'season' | 'tag'; h1: string; label: string; keyword: string; short: string; parties: Party[] }

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
