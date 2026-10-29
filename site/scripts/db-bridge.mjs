/**
 * Database bridge (GitHub Actions, run by hand) for sessions that cannot reach the database directly.
 * Reads a plan (bridge/plan.json), runs its steps in order against Supabase zqfscuwkxcoktpjhaebv with
 * SUPABASE_SERVICE_KEY, and writes what it read and what each call returned to bridge/out/. Writes go
 * only through the database's own functions (allowlisted below) or inserts into allowlisted tables,
 * so provenance and checks stay in the database. The log prints step names and short statuses only.
 *
 * Step types:
 *   { "rpc": "party_event_copy", "args": { ... } }                  call a database function
 *   { "rpc_each": "party_event_copy", "args_from": "bridge/copy.json" }  one call per array item
 *   { "dice_refresh": { "rounds": 40 } }                              party_dice_ingest + party_dice_request until done
 *   { "dump": "events", "path": "party_events?select=...&night_date=gte.2026-10-22" }   GET into bridge/out/<name>.json
 *   { "insert": "party_leads", "rows": [ ... ] }                      plain insert (allowlisted tables)
 *   { "bar_locate": { "slug": "...", "address": "250 Ashland Pl, Brooklyn, NY 11217", "source": "https://...", "hood": "Fort Greene" } }
 *   { "sleep": 10 }
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SUPABASE_SERVICE_KEY missing'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const RPC_OK = /^(party_[a-z_]+|bar_(fix_hh|fix_field|promote|set_status|recheck_request|recheck_ingest|recheck_apply|recheck_pull|recheck_import)|page_copy_save|blog_post_save)$/;
const INSERT_OK = new Set(['party_leads', 'party_venues', 'party_runs', 'party_rules']);
const plan = JSON.parse(readFileSync(process.argv[2] ?? 'bridge/plan.json', 'utf-8'));
mkdirSync('bridge/out', { recursive: true });
const results = [];
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const short = (x) => JSON.stringify(x)?.slice(0, 160);

async function rpc(fn, args = {}) {
  if (!RPC_OK.test(fn)) throw new Error(`function not allowed: ${fn}`);
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}
async function get(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok && r.status !== 206) throw new Error(`GET ${path.split('?')[0]}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

for (const [i, s] of plan.steps.entries()) {
  const tag = `#${i + 1}`;
  try {
    if (s.rpc) {
      const r = await rpc(s.rpc, s.args);
      results.push({ step: tag, rpc: s.rpc, args: s.args, ...r });
      console.log(`${tag} ${s.rpc}: ${r.status} ${r.ok ? '' : short(r.body)}`);
    } else if (s.rpc_each) {
      const items = JSON.parse(readFileSync(s.args_from, 'utf-8'));
      let ok = 0;
      for (const args of items) {
        const r = await rpc(s.rpc_each, args);
        if (r.ok) ok++;
        results.push({ step: tag, rpc: s.rpc_each, key: Object.values(args)[0], ...r });
      }
      console.log(`${tag} ${s.rpc_each} x${items.length}: ${ok} ok`);
    } else if (s.dice_refresh) {
      let total = 0;
      for (let k = 0; k < (s.dice_refresh.rounds ?? 40); k++) {
        const a = await rpc('party_dice_ingest');
        const b = await rpc('party_dice_request', { n: s.dice_refresh.n ?? 40, older_than: s.dice_refresh.older_than ?? '2 days' });
        results.push({ step: tag, round: k, ingest: a.body, queued: b.body });
        total += Number(b.body) || 0;
        const waiting = typeof a.body === 'object' && a.body ? Number(a.body.waiting ?? a.body.pending ?? 0) : 0;
        if ((Number(b.body) || 0) === 0 && waiting === 0 && k > 0) break;
        await sleep(12);
      }
      console.log(`${tag} dice_refresh: ${total} requested`);
    } else if (s.dump) {
      const rows = await get(s.path);
      writeFileSync(`bridge/out/${s.dump}.json`, JSON.stringify(rows));
      console.log(`${tag} dump ${s.dump}: ${rows.length} rows`);
    } else if (s.insert) {
      if (!INSERT_OK.has(s.insert)) throw new Error(`insert not allowed: ${s.insert}`);
      const r = await fetch(`${URL}/rest/v1/${s.insert}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(s.rows) });
      const body = await r.json().catch(() => null);
      results.push({ step: tag, insert: s.insert, status: r.status, body });
      console.log(`${tag} insert ${s.insert}: ${r.status}`);
    } else if (s.venue_from_dice) {
      // a venue that is not in party_venues yet: its name and address from the DICE event page's own
      // JSON-LD, coordinates and borough from NYC GeoSearch; five boroughs only, never guessed
      const { id, url } = s.venue_from_dice;
      const have = await get(`party_venues?select=id&id=eq.${encodeURIComponent(id)}`);
      if (have.length) { console.log(`${tag} venue ${id}: exists`); continue; }
      const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)' } })).text();
      const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).flat().find((x) => x?.location);
      const loc = ld?.location ?? {};
      const a = typeof loc.address === 'string' ? loc.address : [loc.address?.streetAddress, loc.address?.addressLocality, loc.address?.postalCode].filter(Boolean).join(', ');
      if (!loc.name || !a) { results.push({ step: tag, venue: id, error: 'no venue in DICE JSON-LD' }); console.log(`${tag} venue ${id}: no address on DICE`); continue; }
      const g = await (await fetch(`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(a)}`)).json();
      const f = g.features?.[0], p = f?.properties ?? {};
      const boro = { Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens', Bronx: 'The Bronx', 'Staten Island': 'Staten Island' }[p.borough];
      if (!f || !boro || (p.confidence ?? 0) < 0.8) { results.push({ step: tag, venue: id, error: 'not geocoded in NYC', address: a, geo: p.label }); console.log(`${tag} venue ${id}: not placed in the five boroughs`); continue; }
      const row = { id, name: loc.name, address: `${p.housenumber ?? ''} ${p.street ?? ''}`.trim() || a, zip: p.postalcode ?? null, borough: boro,
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], sources: [{ name: 'DICE', url, checked_at: new Date().toISOString() }, { name: 'NYC GeoSearch', url: 'https://geosearch.planninglabs.nyc', label: p.label }] };
      const r = await fetch(`${URL}/rest/v1/party_venues`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });
      results.push({ step: tag, venue: id, status: r.status, row, body: await r.json().catch(() => null) });
      console.log(`${tag} venue ${id}: ${r.status}`);
    } else if (s.bar_locate) {
      // a pending bar's street address as its own site prints it; coordinates and borough from NYC
      // GeoSearch (an address match, five boroughs only). Refuses when the bar already has coordinates
      // more than 400 m away (a different branch), or when the neighborhood is not one nyc_hoods knows.
      // Logged in bar_fix_log; bar_promote then takes it live.
      const { slug, address, source, hood, reason } = s.bar_locate;
      const [b] = await get(`h_nyc_happy_hour?select=slug,status,geo,address,lat,lng&slug=eq.${encodeURIComponent(slug)}`);
      const fail = (error, extra = {}) => { results.push({ step: tag, bar: slug, error, ...extra }); console.log(`${tag} locate ${slug}: ${error}`); };
      // live: true corrects a live bar's neighborhood only (address and coordinates stay), still checked
      // against GeoSearch and nyc_hoods and logged
      if (!b || b.status !== (s.bar_locate.live ? 'live' : 'pending')) { fail(s.bar_locate.live ? 'not live' : 'not pending'); continue; }
      if (!/^https?:\/\//.test(source ?? '') || !address) { fail('address and source required'); continue; }
      const g = await (await fetch(`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(address)}`)).json();
      const f = g.features?.[0], p = f?.properties ?? {};
      if (!f || !p.borough || !p.housenumber || (p.confidence ?? 0) < 0.8) { fail('not an address in the five boroughs', { geo: p.label ?? null }); continue; }
      const [lng, lat] = f.geometry.coordinates;
      const off = b.lat == null ? 0 : Math.round(111320 * Math.hypot(lat - b.lat, (lng - b.lng) * Math.cos((lat * Math.PI) / 180)));
      if (off > 400) { fail(`${off} m from the coordinates on record`, { geo: p.label }); continue; }
      const hoods = new Set((await get('nyc_hoods?select=name')).map((h) => h.name));
      const geo = hood ?? b.geo; // a hood passed in corrects the one on record (read off the address)
      if (!hoods.has(geo)) { fail(`neighborhood not recognized: ${geo}`); continue; }
      const row = s.bar_locate.live ? { geo } : { address: address.split(',')[0].trim(), lat, lng, geo };
      const r = await fetch(`${URL}/rest/v1/h_nyc_happy_hour?slug=eq.${encodeURIComponent(slug)}&status=eq.${s.bar_locate.live ? 'live' : 'pending'}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      await fetch(`${URL}/rest/v1/bar_fix_log`, { method: 'POST', headers: H, body: JSON.stringify({ slug, field: s.bar_locate.live ? 'geo' : 'address',
        old: { address: b.address, lat: b.lat, lng: b.lng, geo: b.geo }, new: { ...row, geosearch: p.label }, source, reason: reason ?? 'address from the bar\'s own site' }) });
      results.push({ step: tag, bar: slug, status: r.status, row, geosearch: p.label, moved_m: off });
      console.log(`${tag} locate ${slug}: ${r.status}`);
    } else if (s.fetch_pages) {
      // public pages a review needs (a bar's own site), as plain text into bridge/out/<name>.json: each
      // starting URL plus up to 7 same-site links whose path or text mentions happy hour, specials,
      // menus, hours or location. For sessions whose own network cannot reach the sites.
      const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)' };
      const plain = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, "'")
        .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      const out = [];
      for (const [key, urls] of Object.entries(s.fetch_pages.sites)) {
        const seen = new Set(), queue = [...urls];
        while (queue.length && seen.size < urls.length + 7) {
          const u = queue.shift();
          if (seen.has(u)) continue;
          seen.add(u);
          try {
            const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
            const ct = r.headers.get('content-type') ?? '';
            if (!ct.includes('html')) { out.push({ key, url: r.url, status: r.status, type: ct }); continue; }
            const html = await r.text();
            out.push({ key, url: r.url, status: r.status, text: plain(html).slice(0, 15000) });
            if (seen.size > urls.length) continue; // links from the starting pages only
            const host = new globalThis.URL(r.url).host.replace(/^www\./, '');
            for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
              let h; try { h = new globalThis.URL(m[1], r.url); } catch { continue; }
              if (h.host.replace(/^www\./, '') !== host || seen.has(h.href)) continue;
              if (/happy|special|menu|hour|drink|contact|location|visit|about|find/i.test(`${h.pathname} ${m[2].replace(/<[^>]+>/g, '')}`)) queue.push(h.href);
            }
          } catch (e) { out.push({ key, url: u, error: String(e.message ?? e).slice(0, 100) }); }
        }
      }
      writeFileSync(`bridge/out/${s.fetch_pages.name ?? 'pages'}.json`, JSON.stringify(out));
      console.log(`${tag} fetch_pages: ${out.length} pages, ${out.filter((p) => p.text).length} with text`);
    } else if (s.probe) {
      // what a crawler gets from public URLs: status, redirect, robots headers and tags, canonical, title
      for (const u of s.probe.urls) for (const [who, ua] of Object.entries(s.probe.agents ?? { browser: 'Mozilla/5.0' })) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': ua }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
          const body = r.status < 300 ? await r.text() : '';
          const pick = (re) => body.match(re)?.[1] ?? null;
          const row = { url: u, who, status: r.status, location: r.headers.get('location'), xrobots: r.headers.get('x-robots-tag'), mitigated: r.headers.get('cf-mitigated'),
            type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), cfcache: r.headers.get('cf-cache-status'), server: r.headers.get('server'), bytes: body.length, robots: pick(/<meta name="robots" content="([^"]+)"/), canonical: pick(/<link rel="canonical" href="([^"]+)"/),
            title: pick(/<title>([^<]*)<\/title>/), head: /\.(txt|xml)$/.test(new globalThis.URL(u).pathname) ? body.slice(0, 600) : undefined };
          results.push({ step: tag, probe: row });
          console.log(`${tag} probe ${who} ${new globalThis.URL(u).pathname}: ${r.status}${row.location ? ` -> ${row.location}` : ''}${row.robots ? ` robots=${row.robots}` : ''}${row.xrobots ? ` x-robots=${row.xrobots}` : ''}${row.mitigated ? ` cf-mitigated=${row.mitigated}` : ''}`);
        } catch (e) { results.push({ step: tag, probe: { url: u, who, error: String(e.message ?? e) } }); }
      }
    } else if (s.fetch_ld) {
      // public event pages: their schema.org JSON-LD (dates, place, offers) and Open Graph tags, saved to
      // bridge/out/<name>.json for an offline review. One request at a time, `delay` ms apart.
      const out = [];
      for (const u of s.fetch_ld.urls) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)' }, signal: AbortSignal.timeout(20000) });
          const html = await r.text();
          const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
          const og = Object.fromEntries([...html.matchAll(/<meta[^>]+property="og:([a-z:_]+)"[^>]+content="([^"]*)"/g)].map((m) => [m[1], m[2]]));
          out.push({ url: u, final: r.url, status: r.status, ld, og, title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null });
        } catch (e) { out.push({ url: u, error: String(e.message ?? e).slice(0, 100) }); }
        await sleep((s.fetch_ld.delay ?? 1500) / 1000);
      }
      writeFileSync(`bridge/out/${s.fetch_ld.name ?? 'ld'}.json`, JSON.stringify(out));
      console.log(`${tag} fetch_ld: ${out.length} pages, ${out.filter((p) => p.ld?.length).length} with JSON-LD`);
    } else if (s.sleep) {
      await sleep(s.sleep);
    }
  } catch (e) {
    results.push({ step: tag, error: String(e.message ?? e) });
    console.log(`${tag} error: ${String(e.message ?? e).slice(0, 160)}`);
  }
}
writeFileSync('bridge/out/results.json', JSON.stringify(results, null, 1));
