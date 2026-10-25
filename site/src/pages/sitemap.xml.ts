/** All indexable URLs in one file (lib/sitemap.ts); per-type files are /sitemap-<type>.xml. */
import type { APIRoute } from 'astro';
import { sitemapRows, urlset } from '../lib/sitemap';

export const GET: APIRoute = async () => new Response(urlset(await sitemapRows()), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
