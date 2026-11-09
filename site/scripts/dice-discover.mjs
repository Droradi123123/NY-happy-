/**
 * Weekly DICE discovery (GitHub Actions, .github/workflows/dice-discover.yml, approved Nov 2, 2026). Reads the
 * public DICE page of every venue we list (src/data/dice-venues.json, kept up to date from new nights' event
 * pages) and reports the nights on sale there that are not in party_events at all (published, draft, review or
 * rejected), with the tags DICE gives each (music:dj / music:party / music:gig). It publishes nothing: the
 * nyc-parties skill adds, writes up and publishes from the report (bridge/out/dice_discover.json).
 *
 * It also re-reads the nights listed outside DICE (a venue's own site such as Mood Ring, and Eventbrite) and
 * refreshes those listings, so they stay within the 7-day re-read rule (twice a week, Mondays and Thursdays).
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
// 2b. (Nov 9) DICE's NYC browse page filtered to one night: it lists nights at venues we do not follow yet.
// Holiday nights in the window, and the next three Fridays and Saturdays. A night whose venue we do not have
// is reported with the venue's name and address (venue_id null), for the skill to add the venue first.
const byDiceVenue = new Map(Object.entries(venues).map(([id, u]) => [String(u).replace(/\/$/, ''), id]));
const ymd = (d) => d.toISOString().slice(0, 10);
const scanDays = new Set();
for (let i = 0; i < 21; i++) { const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 864e5); if ([5, 6].includes(d.getUTCDay())) scanDays.add(ymd(d)); }
const y = Number(today.slice(0, 4));
const thanksgivingEve = (yr) => { const d = new Date(Date.UTC(yr, 10, 1)); const first = (4 - d.getUTCDay() + 7) % 7 + 1; return ymd(new Date(Date.UTC(yr, 10, first + 21 - 1))); };
for (const d of [thanksgivingEve(y), `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`, `${y + 1}-01-01`]) if (d >= today && d <= until) scanDays.add(d);
const seen = new Set(found.map((f) => String(f.url).split('?')[0]));
for (const day of [...scanDays].sort()) {
  const html = await page(`https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?from=${day}&until=${day}`).catch(() => '');
  await sleep(1500);
  const codes = [...new Set([...html.matchAll(/"\/event\/([a-z0-9]+-[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const code of codes) {
    const u = `https://dice.fm/event/${code}`;
    if (knownUrls.has(u) || seen.has(u)) continue;
    const ehtml = await page(u).catch(() => '');
    await sleep(1200);
    const ev = ld(ehtml).flat().find((o) => o && /Event$/.test(String(o['@type'])) && o.startDate);
    if (!ev) continue;
    const canon = String(ev.url ?? u).split('?')[0];
    if (knownUrls.has(canon) || seen.has(canon)) continue;
    const nd = night(ev.startDate);
    if (nd < today || nd > until) continue;
    const vlink = ehtml.match(/https:\/\/dice\.fm\/venue\/[a-z0-9-]+|\/venue\/[a-z0-9-]+/)?.[0];
    const vid = vlink ? byDiceVenue.get((vlink.startsWith('http') ? vlink : `https://dice.fm${vlink}`).replace(/\/$/, '')) ?? null : null;
    if (vid && (byNight.get(`${vid}|${nd}`) ?? []).some((e) => similar(e.title, ev.name) >= 0.6)) continue;
    const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
    const addr = typeof loc?.address === 'string' ? loc.address : loc?.address?.streetAddress ?? null;
    if (!vid && /\b(NJ|New Jersey|Hoboken|Jersey City|Newark)\b/i.test(`${addr ?? ''} ${loc?.name ?? ''} ${JSON.stringify(loc?.address ?? '')}`)) continue; // five boroughs only
    seen.add(u); seen.add(canon);
    found.push({ venue_id: vid, night: nd, start: ev.startDate, name: ev.name, url: u, status: String(ev.eventStatus ?? '').split('/').pop(), via: 'browse',
      ...(vid ? {} : { venue_name: loc?.name ?? null, venue_address: addr, dice_venue: vlink ?? null }), tags: [...new Set(ehtml.match(/music:[a-z_]+/g) ?? [])] });
  }
}
// 3. DICE's own tags for each new night (a DJ or party night vs a concert)
const NOT = /karaoke|comedy|open mic|stand[- ]?up|skate|\bclass\b|lesson|viewing party|watch party|trivia|bingo|podcast|reading|screening|market|workshop|yoga|improv/i;
for (const f of found) {
  f.title_filter = NOT.test(f.name) ? 'not a party by title' : null;
  if (f.title_filter) continue;
  if (f.tags) continue; // read already (browse)
  const html = await page(f.url).catch(() => '');
  f.tags = [...new Set(html.match(/music:[a-z_]+/g) ?? [])];
  await sleep(1200);
}
// 4. nights listed outside DICE (party_add_listing): a venue's own site (vendor Venue) and Eventbrite. Re-read each
// published night's public page and refresh the listing, so it stays within the 7-day re-read rule (twice a week,
// Mondays and Thursdays). Only pages that carry schema.org Event data; a page that no longer has it is left for review.
const READABLE = /^https:\/\/(www\.moodringnyc\.club\/events\/|www\.eventbrite\.com\/e\/|joonbug\.com\/)/;
const venueNights = await rest(`party_events?select=id,title,ticket_url,ticket_vendor,venue_id,age_min,themes,performers,organizer&publish_status=in.(published,review,draft)&night_date=gte.${today}&or=(ticket_url.like.https://www.moodringnyc.club/*,ticket_url.like.https://www.eventbrite.com/*,ticket_url.like.https://joonbug.com/*)`);
let refreshed = 0, gone = 0;
for (const e of venueNights.filter((x) => READABLE.test(x.ticket_url))) {
  // the Event can sit on its own or inside WebPage.mainEntity (Joonbug)
  const ev = ld(await page(e.ticket_url).catch(() => '')).flat().flatMap((o) => [o, o?.mainEntity]).find((o) => o && /Event$/.test(String(o['@type'])));
  await sleep(e.ticket_url.includes('joonbug.com') ? 10500 : e.ticket_url.includes('eventbrite.com') ? 2500 : 1200); // Joonbug's robots.txt: 10 s
  if (!ev?.startDate) { gone++; continue; }
  const iso = (s) => (s ? s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2') : null);
  const vendor = e.ticket_url.includes('eventbrite.com') ? 'Eventbrite' : e.ticket_url.includes('joonbug.com') ? 'Joonbug' : 'Venue';
  // the listed price (Nov 9): schema.org offers (an AggregateOffer's lowPrice/highPrice, or each Offer's price), USD only
  const offers = [ev.offers].flat().filter((o) => o && (!o.priceCurrency || o.priceCurrency === 'USD'));
  const nums = offers.flatMap((o) => [o.lowPrice ?? o.price, o.highPrice ?? o.price]).map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= 5000);
  const price = nums.length ? { price_from: Math.min(...nums), price_to: Math.max(...nums) } : {};
  const r = await fetch(`${SB}/rest/v1/rpc/party_add_listing`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p: { vendor, url: e.ticket_url, title: e.title, starts_at: iso(ev.startDate), ends_at: iso(ev.endDate),
      venue_id: e.venue_id, ...(e.age_min !== null ? { age_min: e.age_min } : {}), themes: e.themes ?? [], performers: e.performers ?? [], ...(e.organizer ? { organizer: e.organizer } : {}),
      event_status: /Cancelled/.test(String(ev.eventStatus ?? '')) ? 'cancelled' : undefined, ...price } }) });
  if (r.ok) refreshed++;
}
console.log(`venue listings: ${refreshed} re-read and refreshed${gone ? `, ${gone} no longer on the venue's site (left for review)` : ''}`);
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
