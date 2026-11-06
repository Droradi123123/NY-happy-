/** The pages Google is asked to index (lib/sitemap.ts googleRows); per-type files are /sitemap-<type>.xml; every indexable page for Bing and IndexNow is /sitemap-full.xml. */
import type { APIRoute } from 'astro';
import { googleRows, urlset } from '../lib/sitemap';

export const GET: APIRoute = async () => new Response(urlset(await googleRows()), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
