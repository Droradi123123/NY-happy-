/**
 * The Thursday email (GitHub Actions, .github/workflows/newsletter.yml). Built from the live data at send
 * time: this weekend's most clicked parties, what is coming up (the calendar on /llms.txt), and the happy
 * hours on now, every link back to the site with utm_source=newsletter.
 *
 * Sending goes through Resend: the sign-ups (Supabase newsletter_signups, read with the service key) are
 * added to a Resend audience, and a broadcast goes to that audience. Resend keeps the list, adds the
 * unsubscribe link ({{{RESEND_UNSUBSCRIBE_URL}}}) and never mails an address that unsubscribed. No email
 * address is printed, written to a file or committed: the log shows counts only.
 *
 * MODE=preview (default, and whenever a Resend secret is missing): writes newsletter-preview.html only.
 * MODE=test: also mails the preview to NEWSLETTER_TEST_TO. MODE=send: syncs the audience and sends,
 * once per week (a broadcast named weekly-<date> is never sent twice).
 * Secrets: SUPABASE_SERVICE_KEY, RESEND_API_KEY, RESEND_AUDIENCE_ID, NEWSLETTER_FROM ("YaY NYC <picks@yaynyc.com>"),
 * NEWSLETTER_ADDRESS (the postal address US law requires in every marketing email), NEWSLETTER_TEST_TO.
 */
import { writeFileSync, readFileSync } from 'node:fs';

const SITE = 'https://yaynyc.com';
const SB = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const env = (k) => (process.env[k] || '').trim();
const resendReady = ['RESEND_API_KEY', 'RESEND_AUDIENCE_ID', 'NEWSLETTER_FROM', 'NEWSLETTER_ADDRESS'].every((k) => env(k));
let MODE = env('MODE') || 'preview';
if (MODE !== 'preview' && !resendReady) { console.log('newsletter: Resend secrets missing, preview only'); MODE = 'preview'; }

const nyDay = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
const today = nyDay();
const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
const fri = nyDay(dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow), sun = nyDay((dow === 0 ? 0 : 7 - dow));
const fmt = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('en-US', { timeZone: 'America/New_York', ...o });
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(':00', '').replace(' ', '').toLowerCase() : '');
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const utm = (path) => `${SITE}${path}${path.includes('?') ? '&' : '?'}utm_source=newsletter&utm_medium=email&utm_campaign=weekly-${today}`;
const clean = (t) => t.replace(/\s+SOLD OUT\s*$/i, '').replace(/\s{2,}/g, ' ').trim();

async function rest(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status}`);
  return r.json();
}

// ---------- the content ----------
const parties = (await rest(`site_parties?select=slug,title,night_date,starts_at,doors_at,venue_id,neighborhood,price_from,price_status,event_status&night_date=gte.${today}&order=starts_at`))
  .filter((p) => p.event_status !== 'cancelled');
const venues = new Map((await rest('site_venues?select=id,name')).map((v) => [v.id, v.name]));
const proof = JSON.parse(readFileSync(new URL('../src/data/proof.json', import.meta.url), 'utf-8')).pages ?? {};
const score = (p) => { const x = proof[`/parties/${p.slug}`] ?? {}; return (x.tickets28 ?? 0) * 10 + (x.views28 ?? 0); };
const weekend = parties.filter((p) => p.night_date >= fri && p.night_date <= sun);
const seenVenue = new Set();
const picks = [...weekend].filter((p) => p.event_status !== 'sold_out').sort((a, b) => score(b) - score(a) || a.starts_at.localeCompare(b.starts_at))
  .filter((p) => (seenVenue.has(p.venue_id) ? false : (seenVenue.add(p.venue_id), true))).slice(0, 6);
const price = (p) => (p.price_status === 'free' ? 'Free' : p.price_from ? `From $${Math.round(p.price_from)}` : '');
// coming up: the calendar the site publishes for assistants (one source of truth, lib/events.ts)
let coming = [];
try {
  const llms = await (await fetch(`${SITE}/llms.txt`, { signal: AbortSignal.timeout(20000) })).text();
  const block = llms.split('## Coming up in NYC')[1]?.split('\n## ')[0] ?? '';
  coming = [...block.matchAll(/^- (\d{4}-\d{2}-\d{2})(?: to \d{4}-\d{2}-\d{2})?: \[([^\]]+)\]\((https:\/\/yaynyc\.com[^)]+)\), (\d+) nights? on sale/gm)]
    .map((m) => ({ date: m[1], name: m[2], path: m[3].replace(SITE, ''), n: Number(m[4]) }))
    .filter((e) => e.date > sun && /\/parties\/[a-z-]+$/.test(e.path)).slice(0, 4);
} catch { /* the email goes out without it */ }

const top = picks[0];
const subject = top ? `This weekend in NYC: ${clean(top.title).slice(0, 48)} and ${weekend.length - 1} more` : 'This weekend in NYC';
const row = (p) => `
  <tr><td style="padding:14px 0;border-bottom:1px solid #ECE8F6">
    <div style="font:700 13px/1.3 Arial,sans-serif;color:#C2185B;text-transform:uppercase;letter-spacing:.04em">${esc(fmt(p.night_date))}${time(p.doors_at ?? p.starts_at) ? ` · ${esc(time(p.doors_at ?? p.starts_at))}` : ''}</div>
    <a href="${utm(`/parties/${p.slug}`)}" style="font:800 18px/1.3 Arial,sans-serif;color:#16122B;text-decoration:none">${esc(clean(p.title))}</a>
    <div style="font:15px/1.4 Arial,sans-serif;color:#4A4560">${esc(venues.get(p.venue_id) ?? '')}${p.neighborhood ? `, ${esc(p.neighborhood)}` : ''}${price(p) ? ` · <strong>${esc(price(p))}</strong>` : ''}</div>
  </td></tr>`;
const button = (href, text) => `<a href="${utm(href)}" style="display:inline-block;background:#16122B;color:#FFD400;font:800 15px Arial,sans-serif;padding:12px 18px;border-radius:999px;text-decoration:none">${esc(text)}</a>`;
const html = (unsubscribe, address) => `<!doctype html><html><body style="margin:0;background:#FFF8EC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;padding:24px">
  <tr><td><div style="display:inline-block;background:#FFD400;color:#16122B;font:900 22px Arial,sans-serif;padding:4px 12px;border-radius:10px">YaY NYC</div></td></tr>
  <tr><td style="padding-top:16px"><h1 style="margin:0;font:900 26px/1.2 Arial,sans-serif;color:#16122B">This weekend in NYC</h1>
    <p style="font:16px/1.5 Arial,sans-serif;color:#4A4560;margin:8px 0 0">${esc(fmt(fri, { weekday: 'long', month: 'long', day: 'numeric' }))} to ${esc(fmt(sun, { weekday: 'long', month: 'long', day: 'numeric' }))}: ${weekend.length} parties on our list. The ones people opened and bought tickets for most:</p></td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${picks.map(row).join('')}</table></td></tr>
  <tr><td style="padding-top:18px">${button('/parties/this-weekend', `All ${weekend.length} parties this weekend`)}</td></tr>
  ${coming.length ? `<tr><td style="padding-top:26px"><h2 style="margin:0 0 6px;font:900 20px Arial,sans-serif;color:#16122B">Coming up</h2>
    ${coming.map((e) => `<p style="margin:8px 0;font:16px/1.4 Arial,sans-serif;color:#16122B"><strong>${esc(fmt(e.date))}</strong> · <a href="${utm(e.path)}" style="color:#5B2EE8">${esc(e.name)}</a>: ${e.n} ${e.n === 1 ? 'night' : 'nights'} on sale</p>`).join('')}
    <p style="margin:10px 0 0">${button('/parties/calendar', 'The NYC party calendar')}</p></td></tr>` : ''}
  <tr><td style="padding-top:26px"><h2 style="margin:0 0 6px;font:900 20px Arial,sans-serif;color:#16122B">Before the party</h2>
    <p style="margin:0 0 12px;font:16px/1.5 Arial,sans-serif;color:#4A4560">Every happy hour we track shows the deal, the hours and the date we read it on the bar's own site.</p>
    ${button('/happy-hours/now', 'Happy hours on right now')}</td></tr>
  <tr><td style="padding-top:28px;font:12px/1.5 Arial,sans-serif;color:#7A7590">Prices are the lowest listed on the seller's page when we checked, fees included where shown; they change. You get this because you signed up at yaynyc.com.<br><a href="${unsubscribe}" style="color:#7A7590">Unsubscribe</a> · YaY NYC · ${esc(address)}</td></tr>
</table></td></tr></table></body></html>`;

writeFileSync('newsletter-preview.html', html('#unsubscribe', env('NEWSLETTER_ADDRESS') || '[postal address]'));
console.log(`newsletter: ${weekend.length} parties this weekend, ${picks.length} picks, ${coming.length} coming up; subject "${subject}"`);
if (MODE === 'preview') process.exit(0);
if (!picks.length) { console.log('newsletter: nothing to send this week'); process.exit(0); }

// ---------- Resend ----------
const R = 'https://api.resend.com';
const rh = { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' };
const call = async (method, path, body) => {
  const r = await fetch(`${R}${path}`, { method, headers: rh, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Resend ${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}: ${r.status} ${j?.message ?? ''}`.slice(0, 200));
  return j;
};
if (MODE === 'test') {
  if (!env('NEWSLETTER_TEST_TO')) { console.log('newsletter: NEWSLETTER_TEST_TO missing'); process.exit(1); }
  await call('POST', '/emails', { from: env('NEWSLETTER_FROM'), to: [env('NEWSLETTER_TEST_TO')], subject: `[Test] ${subject}`, html: html(`${SITE}/privacy`, env('NEWSLETTER_ADDRESS')) });
  console.log('newsletter: test sent');
  process.exit(0);
}
// sync the sign-ups into the audience: only addresses Resend does not have yet, so a contact who
// unsubscribed is never added back
const aud = env('RESEND_AUDIENCE_ID');
const signups = await (await fetch(`${SB}/rest/v1/newsletter_signups?select=email`, { headers: { apikey: env('SUPABASE_SERVICE_KEY'), authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}` }, signal: AbortSignal.timeout(30000) })).json();
const have = new Set(((await call('GET', `/audiences/${aud}/contacts`))?.data ?? []).map((c) => String(c.email).toLowerCase()));
let added = 0;
for (const s of signups) {
  const e = String(s.email ?? '').trim().toLowerCase();
  if (!e || have.has(e)) continue;
  try { await call('POST', `/audiences/${aud}/contacts`, { email: e }); added++; have.add(e); } catch { /* invalid address: skipped */ }
  await new Promise((r) => setTimeout(r, 600)); // Resend allows 2 requests a second
}
console.log(`newsletter: ${signups.length} sign-ups, ${added} new in the audience`);
const name = `weekly-${today}`;
const sent = ((await call('GET', '/broadcasts'))?.data ?? []).some((b) => b.name === name);
if (sent) { console.log(`newsletter: ${name} already exists, not sent again`); process.exit(0); }
const b = await call('POST', '/broadcasts', { audience_id: aud, from: env('NEWSLETTER_FROM'), subject, html: html('{{{RESEND_UNSUBSCRIBE_URL}}}', env('NEWSLETTER_ADDRESS')), name });
await call('POST', `/broadcasts/${b.id}/send`, {});
console.log(`newsletter: ${name} sent`);
