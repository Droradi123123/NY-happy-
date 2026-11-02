/**
 * Weekly DICE discovery (GitHub Actions, .github/workflows/dice-discover.yml, approved Nov 2, 2026). Reads the
 * public DICE page of every venue we list (src/data/dice-venues.json, kept up to date from new nights' event
 * pages) and reports the nights on sale there that are not in party_events at all (published, draft, review or
 * rejected), with the tags DICE gives each (music:dj / music:party / music:gig). It publishes nothing: the
 * nyc-parties skill adds, writes up and publishes from the report (bridge/out/dice_discover.json).
 *
 * Public pages only, one at a time, never /api/. Reads party_events with SUPABASE_SERVICE_KEY; prints counts only.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SB = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('dice-discover: SUPABASE_SERVICE_KEY missing'); process.exit(1); }
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mapFile = new URL('../src/data/dice-venues.json', import.meta.url);
const venues = JSON.parse(readFileSync(mapFile, 'utf-8'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const until = new Date(Date.now() + 75 * 864e5).toISOString().slice(0, 10);

async function rest(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    const page = await r.json();
    if (!Array.isArray(page)) throw new Error(`${path.split('?')[0]}: ${r.status}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const page = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) }); return r.ok ? r.text() : ''; };
const ld = (html) => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const similar = (a, b) => { const x = new Set(norm(a).split(' ')), y = new Set(norm(b).split(' ')); const i = [...x].filter((w) => y.has(w)).length; return i / Math.max(1, Math.min(x.size, y.size)); };
// a night that starts after midnight belongs to the evening before (party_night in the database)
const night = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.parse(iso) - 6 * 3600e3));

const events = await rest(`party_events?select=id,title,night_date,venue_id,ticket_url,publish_status&night_date=gte.${today}`);
const byNight = new Map();
for (const e of events) byNight.set(`${e.venue_id}|${e.night_date}`, [...(byNight.get(`${e.venue_id}|${e.night_date}`) ?? []), e]);
const knownUrls = new Set(events.map((e) => String(e.ticket_url ?? '').split('?')[0]));

// 1. venues with a published night but no DICE page on file: find it from one of their event pages
const missing = [...new Map(events.filter((e) => e.venue_id && !venues[e.venue_id] && /dice\.fm\/event\//.test(e.ticket_url ?? '')).map((e) => [e.venue_id, e.ticket_url])).entries()];
for (const [vid, u] of missing.slice(0, 40)) {
  const m = (await page(u).catch(() => '')).match(/\/venue\/[a-z0-9-]+/);
  if (m) venues[vid] = `https://dice.fm${m[0]}`;
  await sleep(1200);
}
writeFileSync(mapFile, JSON.stringify(Object.fromEntries(Object.entries(venues).sort()), null, 1) + '\n');

// 2. every venue page: the nights in its structured data that we do not have
const found = [];
let listed = 0;
for (const [vid, url] of Object.entries(venues)) {
  const html = await page(url).catch(() => '');
  for (const place of ld(html).filter((o) => o && o['@type'] === 'Place')) {
    for (const ev of place.event ?? []) {
      const nd = night(ev.startDate);
      if (nd < today || nd > until) continue;
      listed++;
      if (knownUrls.has(String(ev.url).split('?')[0])) continue;
      if ((byNight.get(`${vid}|${nd}`) ?? []).some((e) => similar(e.title, ev.name) >= 0.6)) continue;
      found.push({ venue_id: vid, night: nd, start: ev.startDate, name: ev.name, url: ev.url, status: String(ev.eventStatus ?? '').split('/').pop() });
    }
  }
  await sleep(1500);
}
// 3. DICE's own tags for each new night (a DJ or party night vs a concert)
const NOT = /karaoke|comedy|open mic|stand[- ]?up|skate|\bclass\b|lesson|viewing party|watch party|trivia|bingo|podcast|reading|screening|market|workshop|yoga|improv/i;
for (const f of found) {
  f.title_filter = NOT.test(f.name) ? 'not a party by title' : null;
  if (f.title_filter) continue;
  const html = await page(f.url).catch(() => '');
  f.tags = [...new Set(html.match(/music:[a-z_]+/g) ?? [])];
  await sleep(1200);
}
const candidates = found.filter((f) => !f.title_filter && f.status !== 'EventCancelled');
const parties = candidates.filter((f) => f.tags?.some((t) => t === 'music:dj' || t === 'music:party'));
writeFileSync('bridge/out/dice_discover.json', JSON.stringify({ run: new Date().toISOString(), venues: Object.keys(venues).length, listed, new: found.length, candidates, parties: parties.length }, null, 0));
const wd = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${d}T12:00:00Z`).getUTCDay()];
const byDay = parties.reduce((m, f) => ({ ...m, [wd(f.night)]: (m[wd(f.night)] ?? 0) + 1 }), {});
const md = [`## DICE discovery ${today}`, '', `- ${Object.keys(venues).length} venue pages, ${listed} nights listed in the next 75 days, ${found.length} not in our database`,
  `- ${candidates.length} candidates after the title filter; ${parties.length} tagged DJ or party by DICE (${Object.entries(byDay).map(([d, n]) => `${d} ${n}`).join(', ')})`, '',
  ...parties.slice(0, 60).map((f) => `- ${f.night} ${wd(f.night)} · ${f.venue_id} · ${f.name}`)];
writeFileSync('dice-discover.md', md.join('\n') + '\n');
console.log(md.slice(0, 4).join('\n'));
