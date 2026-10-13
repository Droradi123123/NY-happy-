import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\nDisallow: /data/\n\nSitemap: https://yaynyc.com/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } });
