/**
 * Runs after `astro build`. A party page leaves the site once its night is over; its URL may already be
 * indexed and linked, so instead of a 404 it gets a permanent redirect to its venue's page (which lists
 * the venue's next nights), or to /parties when the venue has no page. Appends the lines to
 * dist/_redirects (Cloudflare static assets). Only nights over for more than 2 hours (the site's own
 * cutoff) and from the last 150 days; never a URL that still has a page. YAY_FIXTURE=1 skips it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const dist = join(process.cwd(), 'dist');
const file = join(dist, '_redirects');
const LIMIT = 1800; // Cloudflare allows 2,000 static redirects; leave room for the hand-written ones

if (process.env.YAY_FIXTURE === '1') { console.log('ended redirects: fixture mode, skipped'); process.exit(0); }
const since = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10);
let rows = [];
try {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_parties?select=slug,venue_id,starts_at,ends_at,night_date&night_date=gte.${since}&order=night_date.desc`,
    { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  rows = await r.json();
} catch (e) {
  console.warn(`ended redirects: could not read parties (${e.message}); none added`);
  process.exit(0);
}
const cutoff = Date.now() - 2 * 3600e3;
const have = existsSync(file) ? readFileSync(file, 'utf-8') : '';
const taken = new Set(have.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean));
const base = taken.size, lines = [];
for (const p of rows) {
  const end = p.ends_at ? Date.parse(p.ends_at) : Date.parse(p.starts_at) + 6 * 3600e3;
  if (!(end < cutoff)) continue;
  const from = `/parties/${p.slug}`;
  if (taken.has(from) || existsSync(join(dist, 'parties', `${p.slug}.html`))) continue;
  const to = p.venue_id && existsSync(join(dist, 'parties', 'venue', `${p.venue_id}.html`)) ? `/parties/venue/${p.venue_id}` : '/parties';
  lines.push(`${from} ${to} 301`);
  taken.add(from);
  if (base + lines.length >= LIMIT) break;
}
writeFileSync(file, `${have.trimEnd()}\n\n# Parties that are over (scripts/ended-redirects.mjs, ${new Date().toISOString().slice(0, 10)})\n${lines.join('\n')}\n`);
console.log(`ended redirects: ${lines.length} added`);
