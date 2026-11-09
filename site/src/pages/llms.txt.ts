/** /llms.txt (llmstxt.org): the site in plain text so AI assistants can find and cite it. */
import type { APIRoute } from 'astro';
import { allBars, allHoods, dealLabel, scheduleLabel, partyData, venueOf, cleanTitle, nightDate, priceLabel } from '../lib/data';
import { SITE } from '../lib/seo';
import { partyLists } from '../lib/partyLists';
import { halloweenPages } from '../lib/halloween';
import { allGuides } from '../lib/guides';
import { nyTime } from '../lib/data';
import { listPages } from '../lib/lists';
import { priceIndex, KINDS, money } from '../lib/priceIndex';
import { stats } from '../lib/stats';
import { nycEvents } from '../lib/events';
import { attractions, attractionCategories, placeLabel } from '../lib/attractions';

export const GET: APIRoute = async () => {
  const bars = await allBars();
  const hoods = await allHoods();
  const { parties, venues } = await partyData();
  const lists = (await partyLists()).filter((l) => l.indexable && l.parties.length >= 3);
  const hw = (await halloweenPages()).built.filter((b) => b.indexable);
  const guides = (await allGuides()).filter((g) => g.status === 'published');
  const when = (await partyLists()).filter((l) => l.kind === 'when' && l.parties.length > 0);
  const events = await nycEvents();
  const hhLists = (await listPages()).filter((l) => l.kind !== 'hood');
  const pi = await priceIndex();
  const st = stats(bars);
  const today = new Date().toISOString().slice(0, 10);
  const tonight = parties.filter((p) => p.night_date === today).length;
  // facts an assistant can quote, each with the date it is true for
  const facts = [
    `## Facts (as of ${today})`, '',
    `- ${st.n} NYC bars with a verified happy hour (times, and the deal for ${st.deals}), each read from the bar's own site or menu, with the date read.`,
    ...KINDS.filter((k) => pi.city[k.id]?.n).map((k) => `- Median happy-hour price of ${k.one} in NYC: ${money(pi.city[k.id].median)} (${pi.city[k.id].n} bars, NYC Happy Hour Price Index).`),
    `- ${st.late} bars run a late-night happy hour and ${st.weekend} run one on the weekend.`,
    `- ${parties.length} upcoming parties at ${new Set(parties.map((p) => p.venue_id)).size} venues${tonight ? `, ${tonight} tonight` : ''}; prices are the lowest ticket listed by the seller when we checked, fees included where shown.`,
    '',
  ];
  // attractions: facts read from each official site, with the date read; blank facts are left out, never guessed
  const attrs = attractions();
  const attrLines = attrs.length ? ['## NYC attractions', '',
    `- [All ${attrs.length} NYC attractions](${SITE}/attractions): hours and admission from each official site`,
    ...attractionCategories().map((c) => `- [${c.label} in NYC](${SITE}/attractions/${c.slug}): ${c.items.length}`),
    ...attrs.map((a) => `- [${a.name}](${SITE}${a.path}): ${a.catLabel}, ${placeLabel(a)}${a.address ? `; ${a.address}` : ''}${a.hours_recurring ? `; hours: ${a.hours_recurring}` : ''}${a.price_summary ? `; admission: ${a.price_summary}` : a.price_flag === 'free' ? '; free' : ''}; checked ${a.verified_at}`), ''] : [];
  const byHood = hoods.map((h) => ({ h, list: bars.filter((b) => b.hoodSlug === h.slug) })).filter((x) => x.list.length >= 5);
  const lines = [
    '# YaY NYC', '',
    '> All the fun in NYC in one place: verified happy hours (deal, times, date checked, source) and parties (doors, venue, age, price, tickets) across the five boroughs.', '',
    `- [All NYC happy hours](${SITE}/happy-hours)`, `- [Happy hour right now](${SITE}/happy-hours/now)`, `- [Parties](${SITE}/parties)`, ...(attractions().length ? [`- [NYC attractions](${SITE}/attractions)`] : []),
    ...when.map((l) => `- [${l.h1}](${SITE}/parties/${l.slug}): ${l.parties.length} parties`),
    `- [NYC party calendar](${SITE}/parties/calendar): holidays and big nights for the next four months`, '',
    ...(events.length ? ['## Coming up in NYC', '', ...events.map((e) => `- ${e.date}${e.end && e.end !== e.date ? ` to ${e.end}` : ''}: [${e.name}](${SITE}${e.href ?? '/parties/calendar'})${e.nights.length ? `, ${e.nights.length} ${e.nights.length === 1 ? 'night' : 'nights'} on sale` : ', nothing on sale yet'}${e.datePage ? `; every party that night: ${SITE}/parties/date/${e.date}` : ''}`), ''] : []),
    ...facts,
    '## Happy hour lists', '', ...hhLists.map((l) => `- [${l.label}](${SITE}/happy-hours/${l.slug}): ${l.bars.length} bars`), '',
    ...byHood.flatMap(({ h, list }) => [`## Happy hours in ${h.name}`, '', `- [All ${list.length} in ${h.name}](${SITE}/happy-hours/${h.slug})`,
      ...list.map((b) => `- [${b.name}](${SITE}/bars/${b.slug}): ${scheduleLabel(b)}${dealLabel(b) ? `; ${dealLabel(b)}` : ''}${b.checked ? `; checked ${b.checked.slice(0, 10)}` : ''}`), '']),
    ...(lists.length || hw.length ? ['## Party guides', '', ...(hw.length ? [`- [Halloween parties in NYC](${SITE}/parties/halloween)`, ...hw.map((b) => `- [${b.page.h1}](${SITE}/parties/halloween/${b.page.slug}): ${b.parties.length} parties`)] : []),
      ...lists.map((l) => `- [${l.h1}](${SITE}/parties/${l.slug}): ${l.parties.length} upcoming`), ''] : []),
    ...(parties.length ? ['## Upcoming parties', '', ...parties.map((p) => { const v = venueOf(p, venues); const d = nyTime(p.doors_at ?? p.starts_at); return `- [${cleanTitle(p.title)}](${SITE}/parties/${p.slug}): ${nightDate(p.night_date)}${d ? `, doors ${d}` : ''}, ${v?.name ?? ''}${p.neighborhood ? ` (${p.neighborhood})` : ''}; ${priceLabel(p)}${p.age_min ? `, ${p.age_min}+` : ''}${p.event_status === 'sold_out' ? ', sold out' : ''}`; }), ''] : []),
    ...attrLines,
    '## Data', '', `- [NYC Happy Hour Price Index](${SITE}/nyc-happy-hour-index): median happy-hour price of beer, wine, cocktails and well drinks by borough and neighborhood, from bars' own menus; CSV at ${SITE}/nyc-happy-hour-index.csv`, `- [NYC New Year's Eve Price Index](${SITE}/nyc-nye-price-index): median NYE party ticket by borough and kind of party, with daily price changes; CSV at ${SITE}/nyc-nye-price-index.csv`, '',
    ...(guides.length ? ['## Guides', '', ...guides.map((g) => `- [${g.title}](${SITE}/blog/${g.slug})`), ''] : []),
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
