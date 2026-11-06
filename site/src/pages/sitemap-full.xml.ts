/** Every indexable page, including the ones Google alone is asked to skip: for Bing (submitted by
 * scripts/search-ping.mjs), IndexNow and the live check. Not listed in robots.txt, so Google uses sitemap.xml. */
import type { APIRoute } from 'astro';
import { sitemapRows, urlset } from '../lib/sitemap';

export const GET: APIRoute = async () => new Response(urlset(await sitemapRows()), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
