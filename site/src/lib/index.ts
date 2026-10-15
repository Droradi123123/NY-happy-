/**
 * The compact rows the explorer (filters, list, map) works on in the browser.
 * Short keys keep /data/*.json small: ~740 bars in well under 200 KB before gzip.
 */
import { DAYS, ampm, placePhoto, cardCredit, dealLabel, daysLabel, windowLabel, cleanTitle, priceLabel, nyTime, venueOf, type Bar, type Party, type Venue } from './data';

const min = (t: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const has = (b: Bar, t: string) => b.tags.includes(t);
const photoRow = (kind: 'bar' | 'venue', key: string, hood: string | null, hoodSlug?: string) => { const pp = placePhoto(kind, key, hood, hoodSlug, false); return pp ? { im: [pp.photo.thumb, cardCredit(pp)] as [string, string] } : {}; };

export interface BarRow {
  s: string; n: string; h: string; hn: string; bo: string | null; la: number | null; lo: number | null;
  w: [number[], number | null, number | null][]; sch: string; d: string | null; c: number | null;
  f: string[]; ln: string[]; st: string | null; wm: number | null; ck: string | null; bk: 0 | 1;
  im?: [string, string]; // [thumbnail, short credit]
}
export function barRow(b: Bar): BarRow {
  const f: string[] = [];
  if (b.offers.some((o) => o.kind === 'drink') || b.drinksDeal || b.twoForOne) f.push('drinks');
  if (b.hasFood) f.push('food');
  if (b.oysters) f.push('oysters');
  if (b.twoForOne) f.push('2for1');
  if (b.late) f.push('late');
  if (b.allDay) f.push('allday');
  if (b.weekend) f.push('weekend');
  if (b.early) f.push('early');
  for (const t of ['rooftop', 'outdoor', 'sports', 'cocktails', 'wine', 'cheap-beer', 'pub', 'brewery', 'dive-bar']) if (has(b, t)) f.push(t);
  if (b.dealKnown) f.push('deal');
  return {
    s: b.slug, n: b.name, h: b.hoodSlug, hn: b.hood, bo: b.borough, la: b.onMap ? b.lat : null, lo: b.onMap ? b.lng : null,
    w: b.windows.map((w) => [w.days.map((d) => DAYS.indexOf(d)), min(w.start), min(w.end)]),
    sch: b.windows.map((w) => `${daysLabel(w.days)} ${windowLabel(w)}`).join(' · '),
    d: dealLabel(b), c: b.cheapestDrink, f, ln: b.subway?.lines ?? [], st: b.subway?.station ?? null, wm: b.subway?.walk_min ?? null,
    ck: b.checked?.slice(0, 10) ?? null, bk: b.booking ? 1 : 0,
    ...photoRow('bar', b.slug, b.hood, b.hoodSlug),
  };
}

export interface PartyRow {
  s: string; t: string; nd: string; st: string; en: string | null; tm: string | null; v: string; vn: string; h: string | null; bo: string | null;
  la: number | null; lo: number | null; g: string[]; th: string[]; tg: string[]; p: number | null; pl: string; a: number | null; so: 0 | 1; rich: 0 | 1;
  im?: [string, string];
}
export const PARTY_TAGS: [string, RegExp][] = [
  ['rooftop', /rooftop|\broof\b|skydeck/i], ['lgbtq', /queer|lgbt|\bgay\b|lesbian|\bdrag\b|pride|dyke/i], ['day', /day ?party|daytime|brunch|sunday funday/i],
  ['boat', /yacht|\bboat\b|cruise/i], ['openbar', /open bar/i], ['costume', /costume/i], ['drag', /\bdrag\b/i],
];
/** rooftop, lgbtq, day, boat, openbar, costume, drag: read from the title, the copy and the venue name */
export function partyTags(p: Party, v: Venue | null): string[] {
  const text = `${p.title} ${p.copy?.about ?? ''} ${p.copy?.expect ?? ''} ${v?.name ?? ''}`;
  return PARTY_TAGS.filter(([, re]) => re.test(text)).map(([k]) => k);
}
export function partyRow(p: Party, venues: Venue[]): PartyRow {
  const v = venueOf(p, venues);
  return {
    s: p.slug, t: cleanTitle(p.title), nd: p.night_date, st: p.starts_at, en: p.ends_at, tm: nyTime(p.doors_at ?? p.starts_at),
    v: p.venue_id, vn: v?.name ?? '', h: p.neighborhood, bo: p.borough, la: v?.lat ?? null, lo: v?.lng ?? null,
    g: p.genres, th: p.themes, tg: partyTags(p, v),
    p: p.price_status === 'free' ? 0 : p.price_from, pl: priceLabel(p), a: p.age_min, so: p.event_status === 'sold_out' ? 1 : 0,
    rich: p.copy?.about ? 1 : 0,
    ...photoRow('venue', p.venue_id, v?.neighborhood ?? p.neighborhood),
  };
}
export { ampm };
