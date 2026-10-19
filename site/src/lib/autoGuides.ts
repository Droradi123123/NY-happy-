/**
 * Guides computed from the live data at every build (no hand-written facts that can go stale):
 *   - "<Neighborhood> bar crawl": 4-5 bars in one neighborhood whose happy hours share a weekday,
 *     each leg a short walk, in the order their happy hours end
 *   - "Halloween happy hour NYC": Friday and Saturday happy hours in the neighborhoods with the
 *     most Halloween parties that weekend
 * Every sentence is built from the bars' and parties' own records, so it changes when they do.
 * A guide that cannot be built from the data (no valid route, too few bars) is not published.
 */
import { allBars, partyData, daysLabel, windowLabel, meters, DAYS, type Bar, type Day, type Window } from './data';
import type { Guide } from './guides';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DAY_NAME: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const mins = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const walkM = (a: Bar, b: Bar) => meters({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! });
const walkMin = (m: number) => Math.max(1, Math.round(m / 80));
const list = (xs: string[]) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const dayList = (ds: Day[]) => {
  const l = daysLabel(ds);
  return l === 'Daily' ? 'every day' : l.replace(/Mon/g, 'Monday').replace(/Tue(?!s)/g, 'Tuesday').replace(/Wed(?!n)/g, 'Wednesday').replace(/Thu(?!r)/g, 'Thursday').replace(/Fri(?!d)/g, 'Friday').replace(/Sat(?!u)/g, 'Saturday').replace(/Sun(?!d)/g, 'Sunday').replace(/–/g, ' to ');
};
/** the bar's happy-hour window on a given day (the first one with a start time, if several) */
const windowOn = (b: Bar, d: Day): Window | null => b.windows.filter((w) => w.days.includes(d)).sort((x, y) => (mins(x.start) ?? -1) - (mins(y.start) ?? -1))[0] ?? null;
// a bar is used only when its happy hour was read on its own site in the last 30 days
const FRESH = Date.now() - 30 * 86400e3;
const usable = (b: Bar) => b.lat !== null && b.lng !== null && b.windows.length > 0 && !b.doubt && !!b.checked && new Date(b.checked).getTime() >= FRESH;
const THE = new Set(['Lower East Side', 'Upper East Side', 'Upper West Side', 'East Village', 'West Village', 'Financial District', 'Bronx', 'Flatiron District', 'Theater District']);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const the = (h: string) => (THE.has(h) ? `the ${h}` : h);
const minutesAway = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;
const items = (b: Bar, n = 4) => [...new Set(b.offers.map((o) => o.item.replace(/\s*\(.*?\)\s*/g, ' ').trim()))].slice(0, n);
const street = (b: Bar) => (b.address ? b.address.replace(/^[\d-]+\s+/, '') : null);

// ---------- bar crawls ----------
const CRAWL_HOODS = ['hells-kitchen', 'bushwick', 'upper-west-side', 'upper-east-side', 'greenwich-village', 'chelsea', 'park-slope', 'greenpoint', 'financial-district'];
const MAX_LEG = 700; // meters, about nine minutes on foot

interface Route { stops: Bar[]; days: Day[]; total: number }
function bestRoute(bars: Bar[]): Route | null {
  let best: Route | null = null;
  const weekdays: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const d of weekdays) {
    // bars with an evening-friendly happy hour that day: a start time, and either an end or "to close"
    const open = bars.filter((b) => { const w = windowOn(b, d); return w && w.start && mins(w.start)! <= 17 * 60 + 30 && (w.end === null || mins(w.end)! >= 18 * 60 + 30 || mins(w.end)! < 5 * 60); });
    for (const first of open) {
      const stops = [first];
      while (stops.length < 5) {
        const last = stops[stops.length - 1];
        const next = open.filter((b) => !stops.includes(b)).map((b) => ({ b, m: walkM(last, b) })).filter((x) => x.m <= MAX_LEG).sort((x, y) => x.m - y.m)[0];
        if (!next) break;
        stops.push(next.b);
      }
      if (stops.length < 4) continue;
      const days = DAYS.filter((dd) => stops.every((b) => { const w = windowOn(b, dd); return w && w.start && mins(w.start)! <= 17 * 60 + 30 && (w.end === null || mins(w.end)! >= 18 * 60 + 30 || mins(w.end)! < 5 * 60); })) as Day[];
      const total = stops.slice(1).reduce((s, b, i) => s + walkM(stops[i], b), 0);
      const score = (r: Route) => r.stops.length * 1000 + r.stops.filter((b) => b.dealKnown).length * 700 + r.days.length * 300 - r.total;
      const r = { stops, days, total };
      if (!best || score(r) > score(best)) best = r;
    }
  }
  if (!best) return null;
  // walk them in the order the happy hours end on the main day, so no deal is missed
  const main = best.days.find((d) => ['tue', 'wed', 'thu'].includes(d)) ?? best.days[0];
  const end = (b: Bar) => mins(windowOn(b, main)?.end ?? null) ?? 24 * 60;
  const ordered = [...best.stops].sort((a, b) => end(a) - end(b));
  const total = ordered.slice(1).reduce((s, b, i) => s + walkM(ordered[i], b), 0);
  if (ordered.slice(1).some((b, i) => walkM(ordered[i], b) > MAX_LEG * 1.6)) return { ...best, stops: best.stops };
  return { stops: ordered, days: best.days, total };
}

function crawlGuide(hoodSlug: string, bars: Bar[], updated: string): Guide | null {
  const inHood = bars.filter((b) => b.hoodSlug === hoodSlug && usable(b));
  if (inHood.length < 6) return null;
  const r = bestRoute(inHood);
  if (!r || r.days.length === 0 || r.stops.filter((b) => b.dealKnown).length < 3) return null;
  const hood = r.stops[0].hood;
  const lower = hood.toLowerCase();
  const legs = r.stops.slice(1).map((b, i) => walkM(r.stops[i], b));
  const totalMin = legs.reduce((s, m) => s + walkMin(m), 0);
  const main = r.days.find((d) => ['tue', 'wed', 'thu'].includes(d)) ?? r.days[0];
  const names = r.stops.map((b) => b.name);
  const first = r.stops[0], lastBar = r.stops[r.stops.length - 1];
  const fw = windowOn(first, main)!, lw = windowOn(lastBar, main)!;
  const food = r.stops.filter((b) => b.hasFood);
  const latest = r.stops.map((b) => b.checked).filter(Boolean).sort().pop() ?? updated;
  const lat = r.stops.reduce((s, b) => s + b.lat!, 0) / r.stops.length, lng = r.stops.reduce((s, b) => s + b.lng!, 0) / r.stops.length;
  const why = (b: Bar, i: number) => {
    const w = windowOn(b, main);
    const its = items(b);
    return [
      `${b.name}${street(b) ? ` on ${street(b)}` : ''} is a ${b.category === 'restaurant' ? 'restaurant' : 'bar'} with a happy hour ${b.windows.map((x) => `${dayList(x.days)}, ${windowLabel(x)}`).join('; ')}.`,
      its.length ? `The deal covers ${list(its.map((x) => x.toLowerCase()))}${b.offers.length > its.length ? ' and more' : ''}.` : 'Its site gives the times but does not itemize the deal.',
      b.hasFood ? 'There is food on the happy-hour list too.' : '',
      i === 0 && b.subway ? `Start here: ${b.subway.station} (${b.subway.lines.join(', ')}) is ${minutesAway(b.subway.walk_min)} away.` : '',
      w ? `On ${DAY_NAME[main]}s the deal here runs ${windowLabel(w)}.` : '',
    ].filter(Boolean).join(' ');
  };
  return {
    slug: `${hoodSlug}-bar-crawl`, status: 'published', published: '2026-10-19', updated: latest.slice(0, 10) > '2026-10-19' ? latest.slice(0, 10) : '2026-10-19',
    title: `${hood} Bar Crawl: ${r.stops.length} Happy Hours, ${totalMin} Minutes on Foot`,
    h1: `${hood} bar crawl: ${r.stops.length} happy hours on one walk`,
    short: `${hood} bar crawl`, keyword: `${lower} bar crawl`,
    description: `A ${hood} bar crawl built on happy hours: ${r.stops.length} bars, about ${totalMin} minutes of walking, ${dayList(r.days)}, with the deal at each stop.`.slice(0, 160),
    answer: `This ${hood} bar crawl links ${r.stops.length} happy hours on one walk of about ${totalMin} minutes: ${list(names)}. Every stop has a happy hour ${dayList(r.days)}, so those are the days it works. Start at ${first.name}, whose deal ends first, and finish at ${lastBar.name}.`,
    intro: [
      `A bar crawl works best when every stop is still on its happy hour when you arrive. We built this ${hood} route from the happy hours each bar publishes on its own site: ${r.stops.length} stops within a short walk of each other, all with a deal on the same days, in the order the deals end.`,
      `On a ${DAY_NAME[main]}, the first stop's happy hour runs ${windowLabel(fw)} and the last one's runs ${windowLabel(lw)}. ${food.length ? `${list(food.map((b) => b.name))} ${food.length === 1 ? 'has' : 'have'} food on the happy-hour list, so you can eat on the way.` : 'None of the stops lists food on its happy hour, so plan dinner around the route.'} The cards below show each bar's live hours and prices; check them on the day.`,
    ].join('\n\n'),
    picks: r.stops.map((b, i) => ({ slug: b.slug, why: why(b, i) })),
    route: true,
    sections: [
      { h2: 'When the crawl works', paras: [
        `All ${r.stops.length} stops run a happy hour ${dayList(r.days)}. ${r.days.length < 7 ? `On the other days at least one stop has no deal, so the route is weaker.` : ''} Times differ by day at some bars: the windows below are for ${DAY_NAME[main]}.`,
        esc(r.stops.map((b) => { const w = windowOn(b, main); return w ? `${b.name}: ${windowLabel(w)}` : ''; }).filter(Boolean).join('. ') + '.'),
      ] },
      { h2: 'Getting there and back', paras: [
        esc([first.subway ? `${first.name} is ${minutesAway(first.subway.walk_min)} from ${first.subway.station} (${first.subway.lines.join(', ')}).` : '', lastBar.subway ? `From ${lastBar.name}, ${lastBar.subway.station} (${lastBar.subway.lines.join(', ')}) is ${minutesAway(lastBar.subway.walk_min)} away.` : ''].filter(Boolean).join(' ') || `The route stays inside ${hood}; check the map on each card for the closest station.`),
        `The legs are ${list(legs.map((m) => `${walkMin(m)} min`))} on foot, measured in a straight line at about 80 meters a minute, so allow a little more.`,
      ] },
      { h2: 'Before you go', paras: [
        'Happy hours change. Each card shows the hours and prices we last read on the bar\'s own site and the date we read them; if a bar matters to your plan, check its page before you go. Some deals are served at the bar only.',
      ] },
    ],
    faq: [
      { q: `How long is this ${hood} bar crawl?`, a: `About ${totalMin} minutes of walking across ${r.stops.length} stops, plus however long you stay at each.` },
      { q: 'Which days does it work?', a: `Every stop has a happy hour ${dayList(r.days)}.` },
      { q: 'Where should I start?', a: `At ${first.name}: on ${DAY_NAME[main]}s its happy hour ${fw.end ? `ends at ${windowLabel(fw).split('–').pop()}` : 'runs to close'}, the earliest on the route.` },
      ...(food.length ? [{ q: 'Is there food on the way?', a: `${list(food.map((b) => b.name))} ${food.length === 1 ? 'lists' : 'list'} food on the happy hour.` }] : []),
    ],
    table: `point:${lat.toFixed(5)},${lng.toFixed(5)},600`, tableTitle: `More happy hours near the ${hood} route`,
    method: `Built from each bar's own published happy hour (last read ${latest.slice(0, 10)}), recomputed every time the site updates: the route keeps bars whose happy hours share a weekday, joins them by the shortest walks (straight line, about 80 meters a minute) and orders them by when each deal ends.`,
    related: [[`${hood} happy hours`, `/happy-hours/${hoodSlug}`], ['Happy hours right now', '/happy-hours/now'], ['East Village bar crawl', '/blog/east-village-bar-crawl'], ['Williamsburg bar crawl', '/blog/williamsburg-bar-crawl']],
  };
}

// ---------- Halloween happy hours ----------
async function halloweenHappyHour(bars: Bar[], updated: string): Promise<Guide | null> {
  const { parties } = await partyData();
  const hw = parties.filter((p) => p.themes.includes('halloween') && (p.night_date === '2026-10-30' || p.night_date === '2026-10-31'));
  if (hw.length < 10) return null;
  const hoodCount = [...hw.reduce((m, p) => (p.neighborhood ? m.set(p.neighborhood, (m.get(p.neighborhood) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const picks: { b: Bar; d: Day; hood: string; n: number }[] = [];
  for (const [hood, n] of hoodCount) {
    if (picks.length >= 8) break;
    const here = bars.filter((b) => usable(b) && b.hood === hood && b.offers.length > 0)
      .map((b) => { const w = windowOn(b, 'sat') ?? windowOn(b, 'fri'); return { b, w, d: (windowOn(b, 'sat') ? 'sat' : 'fri') as Day }; })
      .filter((x) => x.w && (mins(x.w.end) ?? 24 * 60) >= 18 * 60)
      .sort((x, y) => Number(y.d === 'sat') - Number(x.d === 'sat') || (mins(y.w!.end) ?? 1440) - (mins(x.w!.end) ?? 1440))
      .slice(0, 2);
    for (const x of here) picks.push({ b: x.b, d: x.d, hood, n });
  }
  if (picks.length < 5) return null;
  const hoods = [...new Set(picks.map((p) => p.hood))];
  const sat = picks.filter((p) => p.d === 'sat').length;
  const latest = picks.map((p) => p.b.checked).filter(Boolean).sort().pop() ?? updated;
  return {
    slug: 'halloween-happy-hour-nyc', status: 'published', published: '2026-10-19', updated: latest.slice(0, 10) > '2026-10-19' ? latest.slice(0, 10) : '2026-10-19',
    title: 'Halloween Happy Hour NYC 2026: Cheap Drinks Before the Party',
    h1: 'Halloween happy hour in NYC: drinks before the party, near the parties',
    short: 'Halloween happy hour', keyword: 'halloween happy hour nyc',
    description: `Halloween happy hour in NYC for 2026: ${picks.length} bars with a Friday or Saturday happy hour in ${list(hoods.map(the))}, near the most Halloween parties.`.slice(0, 160),
    answer: `Halloween is on a Saturday this year, and the parties cluster in ${list(hoods.map(the))}. These ${picks.length} bars there list a happy hour for that weekend: ${sat === picks.length ? 'all of them on Saturdays' : `${sat} on Saturdays and ${picks.length - sat} on Fridays`}, so check the card in case a bar changes its hours for Halloween. Go early in costume, then walk to the party.`,
    intro: [
      `Halloween tickets are the expensive part of the night. A happy hour near the party is the cheap part: we matched the neighborhoods with the most Halloween parties on October 30 and 31 to the bars there whose own sites list a Friday or Saturday happy hour that runs into the evening.`,
      `${cap(hoodCount.slice(0, 4).map(([h, n]) => `${the(h)} has ${n} Halloween ${n === 1 ? 'party' : 'parties'} that weekend`).join('; '))}. Each card below shows the bar's live happy-hour hours and prices; the Halloween parties are on the links further down.`,
    ].join('\n\n'),
    picks: picks.map(({ b, d, hood, n }) => {
      const w = windowOn(b, d)!;
      const its = items(b, 3);
      return { slug: b.slug, why: `In ${the(hood)}, where ${n} Halloween ${n === 1 ? 'party is' : 'parties are'} listed for the weekend. ${b.name} runs its happy hour on ${DAY_NAME[d]} ${windowLabel(w)}${its.length ? `, with ${list(its.map((x) => x.toLowerCase()))}` : ''}. ${b.subway ? `${b.subway.station} (${b.subway.lines.join(', ')}) is ${minutesAway(b.subway.walk_min)} away.` : ''}`.trim() };
    }),
    sections: [
      { h2: 'Plan the night', paras: [
        `Start with the happy hour, then head to the party: most Halloween parties open their doors later in the evening, and each party page shows its doors time. <a href="/parties/halloween/october-31">Halloween parties on October 31</a> and <a href="/parties/halloween/october-30">on October 30</a> are listed night by night.`,
        'Some happy hours are served at the bar only, and a bar can change its hours for Halloween. Check the card on the day, and bring a photo ID: bars and parties check it.',
      ] },
      { h2: 'Find a party nearby', paras: [
        `Halloween parties by borough: <a href="/parties/halloween/brooklyn">Brooklyn</a> and <a href="/parties/halloween/manhattan">Manhattan</a>. By kind: <a href="/parties/halloween/rooftop">rooftop</a>, <a href="/parties/halloween/costume-contest">costume contests</a> and <a href="/parties/halloween/raves">raves</a>. Everything is on the <a href="/parties/halloween">Halloween parties</a> page.`,
      ] },
    ],
    faq: [
      { q: 'Is Halloween 2026 on a weekend?', a: 'Yes. October 31, 2026 is a Saturday, so Friday the 30th and Saturday the 31st are the big nights.' },
      { q: 'Do bars run happy hour on Halloween?', a: `These ${picks.length} bars list a Friday or Saturday happy hour on their own sites. Bars can change hours for holidays, so check the card before you go.` },
      { q: 'Where are most Halloween parties in NYC?', a: `On our list, ${list(hoodCount.slice(0, 3).map(([h, n]) => `${the(h)} (${n})`))} have the most Halloween parties on October 30 and 31.` },
    ],
    method: `Recomputed every time the site updates: the neighborhoods with the most published Halloween parties on October 30 and 31, and in each, up to two bars whose own sites list a Friday or Saturday happy hour running into the evening (deals last read ${latest.slice(0, 10)}).`,
    related: [['Halloween parties in NYC', '/parties/halloween'], ['Halloween weekend guide', '/blog/halloween-weekend-nyc-2026'], ['Saturday happy hours', '/happy-hours/saturday'], ['Happy hours right now', '/happy-hours/now']],
  };
}

let cache: Promise<Guide[]> | null = null;
export function autoGuides(): Promise<Guide[]> {
  cache ??= (async () => {
    const bars = await allBars();
    const updated = new Date().toISOString().slice(0, 10);
    const out: Guide[] = [];
    for (const h of CRAWL_HOODS) { const g = crawlGuide(h, bars, updated); if (g) out.push(g); }
    const hw = await halloweenHappyHour(bars, updated);
    if (hw) out.push(hw);
    return out;
  })();
  return cache;
}
