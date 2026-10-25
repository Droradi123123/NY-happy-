import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\nDisallow: /data/\n\nSitemap: https://yaynyc.com/sitemap.xml\n${['bars', 'parties', 'lists', 'guides', 'other'].map((t) => `Sitemap: https://yaynyc.com/sitemap-${t}.xml`).join('\n')}\n`, { headers: { 'Content-Type': 'text/plain' } });
