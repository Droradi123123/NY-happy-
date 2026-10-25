/**
 * The NYC Happy Hour Price Index: what a happy-hour drink costs, by kind of drink, borough and
 * neighborhood, from the prices bars publish themselves (lib/data.ts offers). Per bar we take its
 * cheapest happy-hour price in each kind; a neighborhood or borough figure is the median of those,
 * shown only with at least MIN bars behind it. Prices whose source page was re-read and showed other
 * prices (doubt 'changed') are left out, as on the bar pages. Rebuilt with the site.
 */
import { allBars, type Bar } from './data';

export type Kind = 'beer' | 'wine' | 'cocktail' | 'well';
export const KINDS: { id: Kind; label: string; one: string }[] = [
  { id: 'beer', label: 'Beer', one: 'a beer' },
  { id: 'wine', label: 'Wine', one: 'a glass of wine' },
  { id: 'cocktail', label: 'Cocktails', one: 'a cocktail' },
  { id: 'well', label: 'Well drinks', one: 'a well drink' },
];
const RX: Record<Kind, RegExp> = {
  beer: /\b(beers?|draft|draught|pints?|lager|ipa|pils(ner)?|ale|stout|tall ?boys?|bud(weiser)?|coors|miller|modelo|corona|stella|guinness|pbr)\b/i,
  wine: /\b(wines?|ros[eé]|prosecco|champagne|cava|vino|sauvignon|pinot|chardonnay|cabernet|malbec|bubbles)\b/i,
  cocktail: /\b(cocktails?|margaritas?|martinis?|negronis?|spritz|mules?|old fashioned|mojitos?|daiquiris?|palomas?|manhattans?|sours?|highballs?|espresso martini)\b/i,
  well: /\b(well|rail|house spirits?|shots?)\b/i,
};
export const MIN = 5;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (x: number) => Math.round(x * 4) / 4;

/** a bar's cheapest published happy-hour price per kind of drink */
export function barPrices(b: Bar): Partial<Record<Kind, number>> {
  if (b.doubt === 'changed') return {};
  const out: Partial<Record<Kind, number>> = {};
  for (const o of b.offers) {
    if (o.kind !== 'drink' || o.dollars === null || o.dollars <= 0 || o.dollars > 30) continue;
    // a "well" cocktail or a "wine & beer" line counts once, for the first kind it names
    const kind = (['well', 'cocktail', 'wine', 'beer'] as Kind[]).find((k) => RX[k].test(o.item));
    if (!kind) continue;
    if (out[kind] === undefined || o.dollars < out[kind]!) out[kind] = o.dollars;
  }
  return out;
}

export interface Cell { median: number; n: number }
export interface Row { name: string; slug: string; borough: string | null; cells: Partial<Record<Kind, Cell>>; bars: number }
export interface PriceIndex {
  built: string; bars: number; priced: number;
  city: Record<Kind, Cell & { p25: number; p75: number; under: Record<number, number> }>;
  boroughs: Row[]; hoods: Row[];
  hist: Record<Kind, { from: number; to: number; n: number }[]>;
  rows: { slug: string; name: string; hood: string; borough: string | null; checked: string | null; prices: Partial<Record<Kind, number>> }[];
}

let cache: Promise<PriceIndex> | null = null;
export function priceIndex(): Promise<PriceIndex> {
  cache ??= (async () => {
    const bars = (await allBars()).filter((b) => b.dealKnown);
    const rows = bars.map((b) => ({ b, p: barPrices(b) })).filter((x) => Object.keys(x.p).length);
    const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
    const city = Object.fromEntries(KINDS.map(({ id }) => {
      const xs = rows.map((r) => r.p[id]).filter((x): x is number => x !== undefined);
      const under = Object.fromEntries([5, 6, 8, 10].map((d) => [d, xs.length ? Math.round((xs.filter((x) => x <= d).length / xs.length) * 100) : 0]));
      return [id, { median: round(median(xs)), n: xs.length, p25: q(xs, 0.25), p75: q(xs, 0.75), under }];
    })) as PriceIndex['city'];
    const group = (key: (b: Bar) => string | null, name: (b: Bar) => string, slug: (b: Bar) => string) => {
      const m = new Map<string, { name: string; slug: string; borough: string | null; list: typeof rows }>();
      for (const r of rows) { const k = key(r.b); if (!k) continue; if (!m.has(k)) m.set(k, { name: name(r.b), slug: slug(r.b), borough: r.b.borough, list: [] }); m.get(k)!.list.push(r); }
      return [...m.values()].map((g) => ({
        name: g.name, slug: g.slug, borough: g.borough, bars: g.list.length,
        cells: Object.fromEntries(KINDS.map(({ id }) => { const xs = g.list.map((r) => r.p[id]).filter((x): x is number => x !== undefined); return [id, xs.length >= MIN ? { median: round(median(xs)), n: xs.length } : undefined]; }).filter(([, v]) => v)),
      })) as Row[];
    };
    const boroughs = group((b) => b.borough, (b) => b.borough!, (b) => (b.borough ?? '').toLowerCase().replace(/\s+/g, '-')).sort((a, b) => b.bars - a.bars);
    const hoods = group((b) => (b.hoodSlug && b.hoodSlug !== 'nyc' ? b.hoodSlug : null), (b) => b.hood, (b) => b.hoodSlug).filter((h) => Object.keys(h.cells).length).sort((a, b) => a.name.localeCompare(b.name));
    const hist = Object.fromEntries(KINDS.map(({ id }) => {
      const xs = rows.map((r) => r.p[id]).filter((x): x is number => x !== undefined);
      const edges = [0, 4, 6, 8, 10, 12, 15, 30];
      return [id, edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1], n: xs.filter((x) => x > from && x <= edges[i + 1]).length }))];
    })) as PriceIndex['hist'];
    return {
      built: new Date().toISOString().slice(0, 10), bars: bars.length, priced: rows.length, city, boroughs, hoods, hist,
      rows: rows.map((r) => ({ slug: r.b.slug, name: r.b.name, hood: r.b.hood, borough: r.b.borough, checked: r.b.checked?.slice(0, 10) ?? null, prices: r.p })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  })();
  return cache;
}
export const money = (x: number) => `$${Number.isInteger(x) ? x : x.toFixed(2)}`;
