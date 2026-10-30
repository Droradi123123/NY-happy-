/**
 * Runs after `astro build`. A party page leaves the site once its night is over; its URL may already be
 * indexed and linked, so instead of a 404 it gets a permanent redirect to its venue's page (which lists
 * the venue's next nights), or to /parties when the venue has no page. Appends the lines to
 * dist/_redirects (Cloudflare static assets). Only nights over for more than 2 hours (the site's own
 * cutoff) and from the last 150 days; never a URL that still has a page. YAY_FIXTURE=1 skips it.
 *
 * A night that is over is marked 'ended' and leaves site_parties, so the live read alone finds almost
 * none (0 on Oct 29: 106 ended pages with Google impressions answered 404). src/data/party-ledger.json
 * keeps every published party's slug, venue and end time; the scheduled deploy run adds to it
 * (`--ledger`), and it was backfilled from party_events on Oct 29.
 *
 * src/data/people-ledger.json keeps every published night's title, lineup, promoter and genres, with no
 * time limit: the artist and promoter pages (lib/people.ts) are built from it, so a page that exists once
 * keeps existing. An ended night redirects to its headliner's page when that artist has a next night.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const dist = join(process.cwd(), 'dist');
const file = join(dist, '_redirects');
const ledgerFile = fileURLToPath(new URL('../src/data/party-ledger.json', import.meta.url));
const peopleFile = fileURLToPath(new URL('../src/data/people-ledger.json', import.meta.url));
const LIMIT = 1800; // Cloudflare allows 2,000 static redirects; leave room for the hand-written ones

if (process.env.YAY_FIXTURE === '1') { console.log('ended redirects: fixture mode, skipped'); process.exit(0); }
const since = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10);
let rows = [];
try {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_parties?select=slug,venue_id,starts_at,ends_at,night_date,title,performers,organizer,genres&night_date=gte.${since}&order=night_date.desc`,
    { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  rows = await r.json();
} catch (e) {
  console.warn(`ended redirects: could not read parties (${e.message}); using the ledger only`);
}
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf-8')) : [];
if (process.argv.includes('--ledger')) {
  // scheduled run: remember every published party, so its URL can redirect once it is over
  const bySlug = new Map(ledger.map((p) => [p.slug, p]));
  for (const p of rows) bySlug.set(p.slug, { slug: p.slug, venue_id: p.venue_id, night_date: p.night_date, starts_at: p.starts_at, ends_at: p.ends_at });
  const kept = [...bySlug.values()].filter((p) => p.night_date >= since).sort((a, b) => (a.night_date < b.night_date ? 1 : a.night_date > b.night_date ? -1 : a.slug < b.slug ? -1 : 1));
  writeFileSync(ledgerFile, JSON.stringify(kept, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`party ledger: ${kept.length} parties (${kept.length - ledger.filter((p) => p.night_date >= since).length} new)`);
  if (rows.length) {
    const people = existsSync(peopleFile) ? JSON.parse(readFileSync(peopleFile, 'utf-8')) : [];
    const byP = new Map(people.map((p) => [p.slug, p]));
    for (const p of rows) byP.set(p.slug, { slug: p.slug, title: p.title, night_date: p.night_date, venue_id: p.venue_id, performers: (p.performers ?? []).slice(0, 12), organizer: p.organizer ?? null, genres: p.genres ?? [] });
    const all = [...byP.values()].sort((a, b) => (a.night_date < b.night_date ? 1 : a.night_date > b.night_date ? -1 : a.slug < b.slug ? -1 : 1));
    writeFileSync(peopleFile, JSON.stringify(all).replace(/\},\{/g, '},\n{') + '\n');
    console.log(`people ledger: ${all.length} nights (${all.length - people.length} new)`);
  }
  process.exit(0);
}
const live = new Set(rows.map((p) => p.slug));
rows = [...rows, ...ledger.filter((p) => !live.has(p.slug) && p.night_date >= since)];
const cutoff = Date.now() - 2 * 3600e3;
// the headliner's artist page, when the build made one and it lists a next night (data-next="1")
const people = new Map((existsSync(peopleFile) ? JSON.parse(readFileSync(peopleFile, 'utf-8')) : []).map((p) => [p.slug, p]));
const artistSlug = (n) => n.replace(/\s*\((us|uk|de|fr|it|nl|br|au|ca|es|il)\)\s*$/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function headliner(slug) {
  const first = people.get(slug)?.performers?.[0];
  if (!first) return null;
  const f = join(dist, 'parties', 'artist', `${artistSlug(first)}.html`);
  return existsSync(f) && readFileSync(f, 'utf-8').includes('data-next="1"') ? `/parties/artist/${artistSlug(first)}` : null;
}
const have = existsSync(file) ? readFileSync(file, 'utf-8') : '';
const taken = new Set(have.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean));
const base = taken.size, lines = [];
for (const p of rows) {
  const end = p.ends_at ? Date.parse(p.ends_at) : Date.parse(p.starts_at) + 6 * 3600e3;
  if (!(end < cutoff)) continue;
  const from = `/parties/${p.slug}`;
  if (taken.has(from) || existsSync(join(dist, 'parties', `${p.slug}.html`))) continue;
  const to = headliner(p.slug) ?? (p.venue_id && existsSync(join(dist, 'parties', 'venue', `${p.venue_id}.html`)) ? `/parties/venue/${p.venue_id}` : '/parties');
  lines.push(`${from} ${to} 301`);
  taken.add(from);
  if (base + lines.length >= LIMIT) break;
}
// pages with impressions that are not built right now (src/data/gone-pages.json): only while they are not
const page = (u) => existsSync(join(dist, `${u.slice(1)}.html`)) || existsSync(join(dist, u.slice(1), 'index.html'));
const gone = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/gone-pages.json', import.meta.url)), 'utf-8')).pages
  .filter((g) => !taken.has(g.from) && !page(g.from)).map((g) => `${g.from} ${page(g.to) ? g.to : g.fallback} 301`);
lines.push(...gone);
// a night page (/parties/date/YYYY-MM-DD) stays up for 7 days after the night, then goes to that night of
// the week (pages exist from Oct 29, 2026; lib/partyLists.ts datePages)
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const nyDay = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
let dates = 0;
for (let i = 8; i <= 150; i++) {
  const d = nyDay(-i);
  if (d < '2026-10-29') break;
  const from = `/parties/date/${d}`;
  if (taken.has(from) || page(from)) continue;
  const wd = `/parties/${WD[new Date(`${d}T12:00:00Z`).getUTCDay()]}`;
  lines.push(`${from} ${page(wd) ? wd : '/parties'} 301`); dates++;
}
writeFileSync(file, `${have.trimEnd()}\n\n# Parties that are over, and pages in src/data/gone-pages.json (scripts/ended-redirects.mjs, ${new Date().toISOString().slice(0, 10)})\n${lines.join('\n')}\n`);
console.log(`ended redirects: ${lines.length - gone.length - dates} parties, ${gone.length} other pages, ${dates} past night pages`);
