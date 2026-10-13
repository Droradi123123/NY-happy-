/** Built from the data (never from routes) with the same thresholds the pages use. */
import type { APIRoute } from 'astro';
import { allBars, allHoods, partyData, stations, landmarks } from '../lib/data';
import { SITE } from '../lib/seo';

export const GET: APIRoute = async () => {
  const bars = await allBars();
  const counts = new Map<string, number>();
  for (const b of bars) counts.set(b.hoodSlug, (counts.get(b.hoodSlug) ?? 0) + 1);
  const hoods = (await allHoods()).filter((h) => (counts.get(h.slug) ?? 0) >= 5);
  const { parties, venues } = await partyData();
  const near = new Set([...(await landmarks()).map((l) => l.slug), ...(await stations()).map((s) => s.slug)]);
  const rows: [string, string | null][] = [
    ['/', null], ['/happy-hours', null], ['/happy-hours/now', null], ['/happy-hours/neighborhoods', null], ['/parties', null], ['/map', null], ['/about', null],
    ...(parties.some((p) => p.themes.includes('halloween')) ? [['/parties/halloween', null] as [string, null]] : []),
    ...hoods.map((h) => [`/happy-hours/${h.slug}`, null] as [string, null]),
    ...[...near].map((s) => [`/happy-hours/near/${s}`, null] as [string, null]),
    ...bars.map((b) => [`/bars/${b.slug}`, b.checked?.slice(0, 10) ?? null] as [string, string | null]),
    ...parties.map((p) => [`/parties/${p.slug}`, p.last_checked?.slice(0, 10) ?? null] as [string, string | null]),
    ...venues.filter((v) => parties.some((p) => p.venue_id === v.id)).map((v) => [`/parties/venue/${v.id}`, null] as [string, null]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map(([u, m]) => `<url><loc>${SITE}${u === '/' ? '' : u}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
