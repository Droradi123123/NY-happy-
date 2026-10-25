/** One sitemap per page type, so Search Console reports index coverage per type. */
import type { APIRoute } from 'astro';
import { sitemapRows, sitemapType, urlset, SITEMAP_TYPES, type SitemapType } from '../lib/sitemap';

export function getStaticPaths() { return SITEMAP_TYPES.map((type) => ({ params: { type } })); }
export const GET: APIRoute = async ({ params }) => {
  const rows = (await sitemapRows()).filter(([u]) => sitemapType(u) === (params.type as SitemapType));
  return new Response(urlset(rows), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
