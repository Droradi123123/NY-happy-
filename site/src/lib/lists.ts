/**
 * Every happy-hour list page under /happy-hours/<slug>: neighborhoods, boroughs, deal types
 * and days of the week. One place decides which exist (5 bars or more, the HappyTLV rule
 * against thin pages), so the pages, the sitemap and the links between pages always agree.
 * Each page targets one search phrase (`keyword`) that its title, h1 and description carry.
 */
import { allBars, allHoods, DAYS, DAY_NAME, type Bar, type Day } from './data';

export const MIN_LIST = 5;
export type ListKind = 'hood' | 'borough' | 'tag' | 'day';
export interface ListPage {
  slug: string; kind: ListKind;
  /** "Rooftop happy hours in NYC": opens the description, names the page in links */
  label: string; h1: string; keyword: string; short: string;
  borough: string | null; bars: Bar[]; preset: Record<string, string | string[]>;
}

const BOROUGHS: [string, string][] = [['manhattan', 'Manhattan'], ['brooklyn', 'Brooklyn'], ['queens', 'Queens'], ['the-bronx', 'The Bronx'], ['staten-island', 'Staten Island']];
const has = (b: Bar, t: string) => b.tags.includes(t);
/** [slug, short name, h1/label, keyword, test, explorer preset] */
const TAGS: [string, string, string, string, (b: Bar) => boolean, Record<string, string | string[]>][] = [
  ['rooftop', 'Rooftop', 'Rooftop Happy Hours in NYC', 'rooftop happy hour nyc', (b) => has(b, 'rooftop'), { tag: ['rooftop'] }],
  ['outdoor', 'Outdoor', 'Outdoor Happy Hours in NYC', 'outdoor happy hour nyc', (b) => has(b, 'outdoor'), { tag: ['outdoor'] }],
  ['oysters', 'Oysters', 'Oyster Happy Hours in NYC', 'oyster happy hour nyc', (b) => b.oysters, { tag: ['oysters'] }],
  ['late-night', 'Late night', 'Late Night Happy Hours in NYC', 'late night happy hour nyc', (b) => b.late, { tag: ['late'] }],
  ['weekend', 'Weekend', 'Weekend Happy Hours in NYC', 'weekend happy hour nyc', (b) => b.weekend, { tag: ['weekend'] }],
  ['all-day', 'All day', 'All Day Happy Hours in NYC', 'all day happy hour nyc', (b) => b.allDay, { tag: ['allday'] }],
  ['food', 'Food deals', 'Happy Hour Food Deals in NYC', 'happy hour food deals nyc', (b) => b.hasFood, { tag: ['food'] }],
  ['2-for-1', '2-for-1', '2-for-1 Happy Hours in NYC', '2 for 1 happy hour nyc', (b) => b.twoForOne, { tag: ['2for1'] }],
  ['cheap-drinks', 'Cheap drinks', 'Cheap Drinks in NYC: Happy Hour Drinks $6 and Under', 'cheap drinks nyc', (b) => b.cheapestDrink !== null && b.cheapestDrink <= 6, { max: '6' }],
  ['cheap-beer', 'Cheap beer', 'Cheap Beer in NYC: Happy Hour Beer Deals', 'cheap beer nyc', (b) => has(b, 'cheap-beer'), { tag: ['cheap-beer'] }],
  ['cocktails', 'Cocktails', 'Cocktail Happy Hours in NYC', 'cocktail happy hour nyc', (b) => has(b, 'cocktails'), { tag: ['cocktails'] }],
  ['wine', 'Wine', 'Wine Happy Hours in NYC', 'wine happy hour nyc', (b) => has(b, 'wine'), { tag: ['wine'] }],
  ['sports-bars', 'Sports bars', 'Sports Bar Happy Hours in NYC', 'sports bar happy hour nyc', (b) => has(b, 'sports'), { tag: ['sports'] }],
  ['dive-bars', 'Dive bars', 'Dive Bar Happy Hours in NYC', 'dive bar happy hour nyc', (b) => has(b, 'dive-bar'), { tag: ['dive-bar'] }],
  ['breweries', 'Breweries', 'Brewery Happy Hours in NYC', 'brewery happy hour nyc', (b) => has(b, 'brewery'), { tag: ['brewery'] }],
  ['pubs', 'Pubs', 'Pub Happy Hours in NYC', 'pub happy hour nyc', (b) => has(b, 'pub'), { tag: ['pub'] }],
];
/** "Late Night Happy Hours in NYC" -> "Late night happy hours in NYC" */
const sentence = (t: string) => { const x = t.replace(/\b(Happy|Hours?|Food|Deals|Drinks|Beer|Bar|Day|Night)\b/g, (w) => w.toLowerCase()); return x[0].toUpperCase() + x.slice(1); };
const DAY_SLUG: Record<Day, string> = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
export const daySlug = (d: Day) => DAY_SLUG[d];

/** best first: the deal spelled out, then the cheapest drink, then the most recently checked */
const rank = (a: Bar, b: Bar) => Number(b.dealKnown) - Number(a.dealKnown) || (a.cheapestDrink ?? 99) - (b.cheapestDrink ?? 99) || (b.checked ?? '').localeCompare(a.checked ?? '') || a.name.localeCompare(b.name);

let cache: Promise<ListPage[]> | null = null;
export function listPages(): Promise<ListPage[]> {
  cache ??= (async () => {
    const bars = await allBars();
    const out: ListPage[] = [];
    const add = (p: Omit<ListPage, 'bars'>, list: Bar[]) => { if (list.length >= MIN_LIST) out.push({ ...p, bars: [...list].sort(rank) }); };
    const boroughSlugs = new Set(BOROUGHS.map(([s]) => s));
    for (const [slug, name] of BOROUGHS) {
      const nm = name.replace(/^The /, '');
      add({ slug, kind: 'borough', label: `${nm} happy hours`, h1: `Happy Hour in ${name.replace(/^The /, 'the ')}`, keyword: `${nm} happy hour`, short: name, borough: name, preset: { bo: [name] } },
        bars.filter((b) => b.borough === name));
    }
    // a neighborhood called like its borough ("Brooklyn") is the borough page
    for (const h of await allHoods()) {
      if (boroughSlugs.has(h.slug)) continue;
      add({ slug: h.slug, kind: 'hood', label: `${h.name} happy hours`, h1: `Happy Hour in ${h.name}`, keyword: `${h.name} happy hour`, short: h.name, borough: h.borough, preset: { hood: h.slug } },
        bars.filter((b) => b.hoodSlug === h.slug));
    }
    for (const [slug, short, h1, keyword, test, preset] of TAGS)
      add({ slug, kind: 'tag', label: sentence(h1.replace(/:.*$/, '')), h1, keyword, short, borough: null, preset }, bars.filter(test));
    for (const d of DAYS)
      add({ slug: DAY_SLUG[d], kind: 'day', label: `${DAY_NAME[d]} happy hours in NYC`, h1: `${DAY_NAME[d]} Happy Hours in NYC`, keyword: `${DAY_NAME[d].toLowerCase()} happy hour nyc`, short: DAY_NAME[d], borough: null, preset: { day: d } },
        bars.filter((b) => b.days.includes(d)));
    return out;
  })();
  return cache;
}

/** where a bar's neighborhood link goes: its list page, its borough page, or the filtered hub */
export async function hoodHref(b: Bar): Promise<string> {
  const pages = await listPages();
  if (pages.some((p) => p.slug === b.hoodSlug)) return `/happy-hours/${b.hoodSlug}`;
  const bo = pages.find((p) => p.kind === 'borough' && p.borough === b.borough);
  return bo ? `/happy-hours/${bo.slug}` : `/happy-hours?hood=${b.hoodSlug}`;
}
