#!/usr/bin/env node
/**
 * After a production deploy: tell IndexNow (Bing, and through it ChatGPT search; also
 * Yandex, Seznam, Naver) which pages are new or changed, so they are crawled within hours.
 *
 * Sends the pages whose sitemap <lastmod> is within the last 3 days, every page without a
 * lastmod that is not a bar (hubs, lists, parties, clubs: they change with the data), or,
 * with --all, every URL (first launch). Never fails the deploy.
 *
 * Cloudflare Workers Builds deploy command:  npx wrangler deploy && node scripts/indexnow.mjs
 */
import { readFileSync } from 'node:fs';

const SITE = 'https://yaynyc.com';
const key = readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf-8').match(/INDEXNOW_KEY = '([0-9a-f]+)'/)?.[1];
try {
  if (!key) throw new Error('no INDEXNOW_KEY in src/lib/site.ts');
  const xml = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf-8');
  const all = process.argv.includes('--all');
  const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const urls = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)]
    .filter(([, loc, mod]) => all || (mod ? mod >= since : !loc.includes('/bars/')))
    .map(([, loc]) => loc);
  if (!urls.length) { console.log('indexnow: nothing changed'); process.exit(0); }
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'yaynyc.com', key, keyLocation: `${SITE}/${key}.txt`, urlList: urls.slice(0, 10000) }),
    signal: AbortSignal.timeout(20000),
  });
  console.log(`indexnow: sent ${urls.length} URLs, HTTP ${r.status}`);
} catch (e) {
  console.warn(`indexnow: skipped (${e.message})`);
}
