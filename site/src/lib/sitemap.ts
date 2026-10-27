/**
 * Every indexable URL, built from the data (never from routes) with the same thresholds the pages use,
 * tagged with its page type so each type can have its own sitemap (Search Console then reports index
 * coverage per type: bars, parties, lists, guides, other).
 */
import { allBars, partyData, landmarks } from './data';
import { listPages } from './lists';
import { partyLists } from './partyLists';
import { halloweenPages } from './halloween';
import { allGuides } from './guides';
import { guideTable } from './guideTables';
import { SITE } from './seo';
import { barIndexable, pathIndexable } from './indexScope';
import { DAY_PAGES, BOROUGH_PAGES, GAME_PAGES, daySlugOf, OBSERVED, bingo, games } from './activities';


export type SitemapType = 'bars' | 'parties' | 'lists' | 'guides' | 'other';
export const SITEMAP_TYPES: SitemapType[] = ['bars', 'parties', 'lists', 'guides', 'other'];
export function sitemapType(u: string): SitemapType {
  if (u.startsWith('/bars/')) return 'bars';
  if (u.startsWith('/parties')) return 'parties';
  if (u.startsWith('/happy-hours') || u.startsWith('/trivia') || u.startsWith('/music-bingo') || u.startsWith('/bars-with-games')) return 'lists';
  if (u.startsWith('/blog')) return 'guides';
  return 'other';
}
let cache: Promise<[string, string | null][]> | null = null;
export function sitemapRows(): Promise<[string, string | null][]> {
  cache ??= (async () => {
    const bars = await allBars();
    const lists = await listPages();
    const { parties, venuePages } = await partyData();
    const plists = await partyLists();
    // a published guide is listed only when its table has enough rows to be worth indexing (same rule as the page)
    const guides = [];
    for (const g of (await allGuides()).filter((g) => g.status === 'published')) {
      const t = g.table ? await guideTable(g.table) : null;
      if (!g.table || (t && t.rows.length >= (g.minRows ?? 3))) guides.push(g);
    }
    // "near" pages: landmarks only (lib/indexScope.ts); a station page sharing a landmark's slug is the landmark's
    const near = new Set((await landmarks()).map((l) => l.slug));
    const rows: [string, string | null][] = [
      ['/', null], ['/happy-hours', null], ['/nyc-happy-hour-index', null], ['/happy-hours/now', null], ['/happy-hours/neighborhoods', null], ['/parties', null], ['/map', null], ['/map/happy-hours', null], ['/map/parties', null], ['/about', null], ['/contact', null], ['/image-credits', null], ['/privacy', null], ['/accessibility', null],
      ...(parties.some((p) => p.themes.includes('halloween')) ? [['/parties/halloween', null] as [string, null]] : []),
      ...(await halloweenPages()).built.filter((b) => b.indexable).map((b) => [`/parties/halloween/${b.page.slug}`, null] as [string, null]),
      ...lists.map((l) => [`/happy-hours/${l.slug}`, null] as [string, null]),
      ...[...near].map((s) => [`/happy-hours/near/${s}`, null] as [string, null]),
      ...bars.filter(barIndexable).map((b) => [`/bars/${b.slug}`, b.checked?.slice(0, 10) ?? null] as [string, string | null]),
      ...parties.map((p) => [`/parties/${p.slug}`, p.last_checked?.slice(0, 10) ?? null] as [string, string | null]),
      ...plists.map((l) => [`/parties/${l.slug}`, null] as [string, null]),
      ...(guides.length ? [['/blog', guides.map((g) => g.updated).sort().pop()!] as [string, string]] : []),
      ...guides.map((g) => [`/blog/${g.slug}`, g.updated] as [string, string]),
      ...venuePages.map((v) => [`/parties/venue/${v.id}`, null] as [string, null]),
      // trivia, music bingo and games: lastmod is the date the listings were read
      ['/trivia', OBSERVED], ...DAY_PAGES.map((d) => [`/trivia/${daySlugOf(d)}`, OBSERVED] as [string, string]),
      ...BOROUGH_PAGES.map(([slug]) => [`/trivia/${slug}`, OBSERVED] as [string, string]),
      ...(bingo.length ? [['/music-bingo', OBSERVED] as [string, string]] : []),
      ...(games.length ? [['/bars-with-games', OBSERVED] as [string, string], ...GAME_PAGES.map((g) => [`/bars-with-games/${g.slug}`, OBSERVED] as [string, string])] : []),
    ];
    return rows.filter(([u]) => pathIndexable(u));
  })();
  return cache;
}
export const urlset = (rows: [string, string | null][]) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
  .map(([u, m]) => `<url><loc>${SITE}${u}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
