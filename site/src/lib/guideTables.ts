/**
 * The data tables inside blog guides. They are computed from the same records as the rest of
 * the site at every build, so a guide's table never disagrees with the bar and party pages.
 * Each row carries its check date; a price re-confirmed on the bar's own page says so.
 */
import { allBars, partyData, rechecks, venueOf, daysLabel, windowLabel, dealLabel, fmtDate, nightDate, nyTime, priceLabel, cleanTitle, meters, LANDMARKS, DAYS, type Bar, type Offer, type Window } from './data';
import { listPages } from './lists';

export interface Cell { text: string; href?: string; note?: string }
export interface GuideTable { caption: string; head: string[]; rows: Cell[][]; note: string }

/** offers held back from headlines until a person re-checks them (audit 2026-10-13, F3) */
const NEEDS_REVIEW = new Set(['ben-jack-s-steakhouse-flatiron', 'mile-17-upper-east-side']);
/** item names that are parsing debris ("for Smoked Wings", "each Oysters", "Menu Happy Hour Oysters") */
const tidyItem = (i: string) => i.replace(/^(for|each)\s+/i, '').replace(/^menu\s+happy\s+hour\s+/i, '').replace(/\s+/g, ' ').trim();
const looksClean = (o: Offer) => !/^(for|each)\s/i.test(o.item) && o.item.length <= 40;
const short = (s: string) => s.replace(/^the /i, 'The ');

async function checkedCell(b: Bar): Promise<Cell> {
  const r = (await rechecks()).get(b.slug);
  if (r?.verdict === 'confirmed') return { text: fmtDate(r.checked) ?? '', note: "price seen on the bar's site" };
  return { text: fmtDate(b.checked) ?? 'not dated', note: 'from the bar’s site' };
}
const barCell = (b: Bar): Cell => ({ text: b.name, href: `/bars/${b.slug}` });
async function hoodCell(b: Bar): Promise<Cell> {
  const pages = await listPages();
  return pages.some((p) => p.slug === b.hoodSlug) ? { text: b.hood, href: `/happy-hours/${b.hoodSlug}` } : { text: b.hood };
}
const when = (ws: Window[]) => ws.map((w) => `${daysLabel(w.days)} ${windowLabel(w)}`).join('; ');
const usable = (b: Bar) => !NEEDS_REVIEW.has(b.slug);
const min = (t: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export async function guideTable(id: string): Promise<GuideTable | null> {
  // the nightlife guides' tables are computed next to the guides (lib/nightGuides.ts)
  if (/^(clubs:|nights:|prices:|nightlife-hoods$|top-hh$)/.test(id)) return (await import('./nightGuides')).nightTable(id);
  const bars = (await allBars()).filter(usable);

  if (id === 'cheapest-by-hood') {
    const pages = (await listPages()).filter((p) => p.kind === 'hood');
    const rows: Cell[][] = [];
    for (const p of pages) {
      const cands = p.bars.filter(usable).flatMap((b) => b.offers.filter((o) => o.kind === 'drink' && o.dollars !== null && o.dollars >= 2 && looksClean(o)).map((o) => ({ b, o })));
      if (cands.length < 3) continue;
      cands.sort((x, y) => x.o.dollars! - y.o.dollars! || x.b.name.localeCompare(y.b.name));
      const { b, o } = cands[0];
      rows.push([{ text: p.short, href: `/happy-hours/${p.slug}` }, { text: `${o.price} ${tidyItem(o.item)}` }, barCell(b), { text: when(b.windows) }, await checkedCell(b)]);
    }
    rows.sort((a, b) => Number(a[1].text.match(/[\d.]+/)?.[0]) - Number(b[1].text.match(/[\d.]+/)?.[0]) || a[0].text.localeCompare(b[0].text));
    return { caption: 'The cheapest happy-hour drink we hold in each neighborhood', head: ['Neighborhood', 'Cheapest drink', 'Bar', 'When', 'Checked'], rows, note: 'Neighborhoods with at least three bars that publish a drink price. Menu price before NYC tax (8.875%) and tip.' };
  }

  if (id === 'oysters') {
    const rows: Cell[][] = [];
    const list = bars.flatMap((b) => b.offers.filter((o) => /oyster/i.test(o.item)).map((o) => ({ b, o }))).sort((x, y) => (x.o.dollars ?? 99) - (y.o.dollars ?? 99) || x.b.name.localeCompare(y.b.name));
    const seen = new Set<string>();
    for (const { b, o } of list) {
      if (seen.has(b.slug)) continue;
      seen.add(b.slug);
      rows.push([barCell(b), await hoodCell(b), { text: `${o.price} ${tidyItem(o.item).toLowerCase()}` }, { text: when(b.windows) }, await checkedCell(b)]);
    }
    return { caption: 'Oyster deals at NYC happy hours', head: ['Bar', 'Neighborhood', 'Oyster deal', 'When', 'Checked'], rows, note: 'Price per oyster unless the bar lists a plate. Bars that mention oysters without a price are on the oyster list page.' };
  }

  if (id === 'late-night') {
    const rows: Cell[][] = [];
    for (const b of bars.filter((b) => b.late)) {
      const late = b.windows.filter((w) => { const s = min(w.start), e = min(w.end); return (e !== null && (e >= 21 * 60 || e < 5 * 60)) || (s !== null && s >= 21 * 60); });
      rows.push([barCell(b), await hoodCell(b), { text: when(late.length ? late : b.windows) }, { text: dealLabel(b) ?? 'times only' }, await checkedCell(b)]);
    }
    rows.sort((a, b) => a[1].text.localeCompare(b[1].text) || a[0].text.localeCompare(b[0].text));
    return { caption: 'Happy hours that run after 9pm', head: ['Bar', 'Neighborhood', 'Late window', 'Deal', 'Checked'], rows, note: '"Times only" means the bar publishes the hours but not what is discounted.' };
  }

  if (id === 'weekend') {
    const rows: Cell[][] = [];
    const list = bars.filter((b) => b.weekend && b.dealKnown).sort((a, b) => (a.cheapestDrink ?? 99) - (b.cheapestDrink ?? 99) || a.name.localeCompare(b.name)).slice(0, 60);
    for (const b of list) {
      const sat = b.windows.filter((w) => w.days.includes('sat')), sun = b.windows.filter((w) => w.days.includes('sun'));
      rows.push([barCell(b), await hoodCell(b), { text: sat.length ? sat.map(windowLabel).join(', ') : 'no' }, { text: sun.length ? sun.map(windowLabel).join(', ') : 'no' }, { text: dealLabel(b) ?? '' }, await checkedCell(b)]);
    }
    return { caption: 'Weekend happy hours with a published deal', head: ['Bar', 'Neighborhood', 'Saturday', 'Sunday', 'Deal', 'Checked'], rows, note: 'Up to 60 bars, cheapest drink first. Every weekend happy hour is on the Saturday and Sunday pages.' };
  }

  if (id === 'food') {
    const rows: Cell[][] = [];
    const list = bars.map((b) => ({ b, f: b.offers.filter((o) => o.kind === 'food' && o.dollars !== null && looksClean(o) && !/oyster/i.test(o.item)).sort((x, y) => x.dollars! - y.dollars!) })).filter((x) => x.f.length).sort((x, y) => x.f[0].dollars! - y.f[0].dollars! || x.b.name.localeCompare(y.b.name)).slice(0, 60);
    for (const { b, f } of list) rows.push([barCell(b), await hoodCell(b), { text: f.slice(0, 3).map((o) => `${o.price} ${tidyItem(o.item).toLowerCase()}`).join(', ') }, { text: when(b.windows) }, await checkedCell(b)]);
    return { caption: 'Happy-hour food with a published price', head: ['Bar', 'Neighborhood', 'Food', 'When', 'Checked'], rows, note: 'Up to 60 bars, cheapest dish first. Oysters have their own guide.' };
  }

  if (id.startsWith('near:')) {
    // near:<landmark slug>[,<landmark slug>]:<latest start hh:mm>
    const [, slugs, latest] = id.split(':');
    const marks = LANDMARKS.filter((l) => slugs.split(',').includes(l.slug));
    const cutoff = min(latest ?? '18:00') ?? 18 * 60;
    const rows: { m: number; r: Cell[] }[] = [];
    for (const b of bars.filter((b) => b.onMap)) {
      const near = marks.map((l) => ({ l, m: meters(l, { lat: b.lat!, lng: b.lng! }) })).filter((x) => x.m <= 800).sort((x, y) => x.m - y.m)[0];
      if (!near) continue;
      const wk = b.windows.filter((w) => w.days.some((d) => DAYS.indexOf(d) < 5) && (min(w.start) ?? 0) <= cutoff);
      if (!wk.length) continue;
      rows.push({ m: near.m, r: [barCell(b), { text: `${Math.max(1, Math.round(near.m / 80))} min${marks.length > 1 ? ` from ${short(near.l.name)}` : ''}` }, { text: when(wk) }, { text: dealLabel(b) ?? 'times only' }, await checkedCell(b)] });
    }
    rows.sort((a, b) => a.m - b.m);
    return { caption: `Weekday happy hours within a 10-minute walk`, head: ['Bar', 'Walk', 'Happy hour', 'Deal', 'Checked'], rows: rows.slice(0, 40).map((x) => x.r), note: 'Walking time is estimated from straight-line distance (about 80 m a minute). Up to 40 bars, closest first.' };
  }

  if (id.startsWith('line:')) {
    // line:<route>: every bar whose nearest station serves the route, west to east (the L and the 7 run that way)
    const route = id.slice(5);
    const list = bars.filter((b) => b.subway?.lines.includes(route) && b.lng !== null).sort((a, b) => a.lng! - b.lng!);
    const rows: Cell[][] = [];
    for (const b of list) rows.push([{ text: b.subway!.station }, barCell(b), await hoodCell(b), { text: when(b.windows) }, { text: dealLabel(b) ?? 'times only' }, await checkedCell(b)]);
    return { caption: `Happy hours by the ${route} train`, head: ['Station', 'Bar', 'Neighborhood', 'Happy hour', 'Deal', 'Checked'], rows, note: `Bars whose nearest subway station is served by the ${route}, listed west to east. Walking times to the station are on each bar's page.` };
  }

  if (id === 'early') {
    // weekday windows that start by 3pm
    const rows: { s: number; r: Cell[] }[] = [];
    for (const b of bars) {
      const early = b.windows.filter((w) => w.days.some((d) => DAYS.indexOf(d) < 5) && (min(w.start) ?? 24 * 60) <= 15 * 60);
      if (!early.length) continue;
      rows.push({ s: Math.min(...early.map((w) => min(w.start)!)), r: [barCell(b), await hoodCell(b), { text: when(early) }, { text: dealLabel(b) ?? 'times only' }, await checkedCell(b)] });
    }
    rows.sort((a, b) => a.s - b.s || a.r[0].text.localeCompare(b.r[0].text));
    return { caption: 'Weekday happy hours that start by 3pm', head: ['Bar', 'Neighborhood', 'Early window', 'Deal', 'Checked'], rows: rows.map((x) => x.r), note: 'Earliest start first. All-day happy hours count when they start by 3pm.' };
  }

  if (id === 'bookable') {
    const rows: Cell[][] = [];
    for (const b of bars.filter((b) => b.booking && b.dealKnown)) rows.push([barCell(b), await hoodCell(b), { text: when(b.windows) }, { text: dealLabel(b) ?? '' }, { text: 'Book', href: b.booking! }]);
    rows.sort((a, b) => a[1].text.localeCompare(b[1].text) || a[0].text.localeCompare(b[0].text));
    return { caption: 'Happy hours at places that take reservations', head: ['Bar', 'Neighborhood', 'Happy hour', 'Deal', 'Reserve'], rows, note: 'Many restaurants serve the happy hour at the bar only, even when you book a table: ask when you reserve.' };
  }

  if (id.startsWith('point:')) {
    // point:<lat>,<lng>,<radius m>
    const [lat, lng, r] = id.slice(6).split(',').map(Number);
    const rows: { m: number; r: Cell[] }[] = [];
    for (const b of bars.filter((b) => b.onMap)) {
      const m = meters({ lat, lng }, { lat: b.lat!, lng: b.lng! });
      if (m <= r) rows.push({ m, r: [barCell(b), { text: `${Math.max(1, Math.round(m / 80))} min` }, { text: when(b.windows) }, { text: dealLabel(b) ?? 'times only' }, await checkedCell(b)] });
    }
    rows.sort((a, b) => a.m - b.m);
    return { caption: 'Happy hours within walking distance', head: ['Bar', 'Walk', 'Happy hour', 'Deal', 'Checked'], rows: rows.slice(0, 40).map((x) => x.r), note: 'Walking time estimated from straight-line distance (about 80 m a minute). Up to 40 bars, closest first.' };
  }

  if (id.startsWith('parties:')) {
    // parties:<theme>[:<borough>]
    const [, theme, borough] = id.split(':');
    const { parties, venues } = await partyData();
    const list = parties.filter((p) => p.themes.includes(theme) && (!borough || p.borough === borough));
    const rows = list.map((p) => {
      const v = venueOf(p, venues);
      return [{ text: nightDate(p.night_date, { weekday: 'short', month: 'short', day: 'numeric' }) }, { text: cleanTitle(p.title), href: `/parties/${p.slug}` }, { text: v?.name ?? 'TBA', ...(v ? { href: `/parties/venue/${v.id}` } : {}) }, { text: p.neighborhood ?? p.borough ?? '' }, { text: nyTime(p.doors_at ?? p.starts_at) ?? '' }, { text: p.age_min ? `${p.age_min}+` : 'not stated' }, { text: p.event_status === 'sold_out' ? 'Sold out' : priceLabel(p) }] as Cell[];
    });
    return { caption: `${list.length} nights`, head: ['Night', 'Party', 'Venue', 'Area', 'Doors', 'Age', 'Tickets'], rows, note: 'Ticket prices are the lowest listed when we last checked the ticket page, with fees; they change. Nights that are over leave this table at the next daily update.' };
  }
  return null;
}
