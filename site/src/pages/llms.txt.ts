/** /llms.txt (llmstxt.org): the site in plain text so AI assistants can find and cite it. */
import type { APIRoute } from 'astro';
import { allBars, allHoods, dealLabel, scheduleLabel, partyData, venueOf, cleanTitle, nightDate, priceLabel } from '../lib/data';
import { SITE } from '../lib/seo';

export const GET: APIRoute = async () => {
  const bars = await allBars();
  const hoods = await allHoods();
  const { parties, venues } = await partyData();
  const byHood = hoods.map((h) => ({ h, list: bars.filter((b) => b.hoodSlug === h.slug) })).filter((x) => x.list.length >= 5);
  const lines = [
    '# YaY NYC', '',
    '> All the fun in NYC in one place: verified happy hours (deal, times, date checked, source) and parties (doors, venue, age, price, tickets) across the five boroughs.', '',
    `- [All NYC happy hours](${SITE}/happy-hours)`, `- [Happy hour right now](${SITE}/happy-hours/now)`, `- [Parties](${SITE}/parties)`, '',
    ...byHood.flatMap(({ h, list }) => [`## Happy hours in ${h.name}`, '', `- [All ${list.length} in ${h.name}](${SITE}/happy-hours/${h.slug})`,
      ...list.map((b) => `- [${b.name}](${SITE}/bars/${b.slug}): ${scheduleLabel(b)}${dealLabel(b) ? `; ${dealLabel(b)}` : ''}${b.checked ? `; checked ${b.checked.slice(0, 10)}` : ''}`), '']),
    ...(parties.length ? ['## Upcoming parties', '', ...parties.map((p) => `- [${cleanTitle(p.title)}](${SITE}/parties/${p.slug}): ${nightDate(p.night_date)}, ${venueOf(p, venues)?.name ?? ''}; ${priceLabel(p)}${p.age_min ? `, ${p.age_min}+` : ''}`), ''] : []),
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
