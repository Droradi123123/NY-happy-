/** Built from the data (never from routes) with the same thresholds the pages use. */
import type { APIRoute } from 'astro';
import { allBars, partyData, stations, landmarks } from '../lib/data';
import { listPages } from '../lib/lists';
import { partyLists } from '../lib/partyLists';
import { SITE } from '../lib/seo';

export const GET: APIRoute = async () => {
  const bars = await allBars();
  const lists = await listPages();
  const { parties, venuePages } = await partyData();
  const plists = await partyLists();
  const near = new Set([...(await landmarks()).map((l) => l.slug), ...(await stations()).map((s) => s.slug)]);
  const rows: [string, string | null][] = [
    ['/', null], ['/happy-hours', null], ['/happy-hours/now', null], ['/happy-hours/neighborhoods', null], ['/parties', null], ['/map', null], ['/about', null], ['/contact', null], ['/image-credits', null], ['/privacy', null], ['/accessibility', null],
    ...(parties.some((p) => p.themes.includes('halloween')) ? [['/parties/halloween', null] as [string, null]] : []),
    ...lists.map((l) => [`/happy-hours/${l.slug}`, null] as [string, null]),
    ...[...near].map((s) => [`/happy-hours/near/${s}`, null] as [string, null]),
    ...bars.map((b) => [`/bars/${b.slug}`, b.checked?.slice(0, 10) ?? null] as [string, string | null]),
    ...parties.map((p) => [`/parties/${p.slug}`, p.last_checked?.slice(0, 10) ?? null] as [string, string | null]),
    ...plists.map((l) => [`/parties/${l.slug}`, null] as [string, null]),
    ...venuePages.map((v) => [`/parties/venue/${v.id}`, null] as [string, null]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map(([u, m]) => `<url><loc>${SITE}${u === '/' ? '' : u}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
