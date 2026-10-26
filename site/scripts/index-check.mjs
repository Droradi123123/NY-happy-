/**
 * Index check (GitHub Actions, run by hand): Search Console URL Inspection on a sample of every page
 * type from the live sitemap, 4 at a time. The repository is public, so the log shows counts per page
 * type and coverage state; only the site's fixed pages (about, privacy, ...) are named, with crawl details.
 */
import { createSign } from 'node:crypto';

const SITE = 'https://yaynyc.com', PROPERTY = 'sc-domain:yaynyc.com', PER_TYPE = Number(process.env.PER_TYPE || 12);
const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}');
if (!sa.client_email) { console.log('GOOGLE_SA_JSON missing'); process.exit(1); }
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'RS256', typ: 'JWT' });
const claims = b64({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/webmasters.readonly' });
const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key, 'base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }) })).json();
if (!tok.access_token) { console.log('sign-in failed'); process.exit(1); }
const auth = { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' };

// sitemaps Google has for the property
const sm = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/sitemaps`, { headers: auth, signal: AbortSignal.timeout(30000) }).then((r) => r.json()).catch(() => ({}));
for (const x of sm.sitemap ?? []) console.log(`sitemap ${new URL(x.path).pathname}: submitted ${x.lastSubmitted?.slice(0, 10) ?? '-'}, read ${x.lastDownloaded?.slice(0, 10) ?? '-'}, errors ${x.errors ?? 0}, ${(x.contents ?? []).map((c) => `${c.type} ${c.submitted} submitted`).join(', ')}`);
if (!(sm.sitemap ?? []).length) console.log('sitemap: none submitted for the property (or not readable)');

const xml = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(30000) }).then((r) => r.text()).catch(() => '');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const typeOf = (u) => { const p = new URL(u).pathname.split('/').filter(Boolean); return !p.length ? 'home' : p[0] === 'happy-hours' && p[1] === 'near' ? 'near' : p[0] === 'parties' && p[1] === 'venue' ? 'venue' : p[0] === 'parties' && p.length === 2 && /-\d{4}-\d{2}-\d{2}$/.test(p[1]) ? 'party' : p[0] === 'parties' ? 'party-lists' : p[0]; };
const byType = {};
for (const u of urls) (byType[typeOf(u)] ??= []).push(u);
console.log(`sitemap.xml: ${urls.length} URLs; ${Object.entries(byType).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);

const sample = Object.values(byType).flatMap((list) => { const step = Math.max(1, Math.floor(list.length / PER_TYPE)); return list.filter((_, i) => i % step === 0).slice(0, PER_TYPE); });
const results = [];
const inspect = async (u) => {
  try {
    const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', headers: auth, body: JSON.stringify({ inspectionUrl: u, siteUrl: PROPERTY }), signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    const x = j.inspectionResult?.indexStatusResult ?? {};
    results.push({ type: typeOf(u), state: r.ok ? (x.coverageState ?? 'unknown') : `error ${r.status}`, u, x });
  } catch (e) { results.push({ type: typeOf(u), state: `error ${e.name}` }); }
};
for (let i = 0; i < sample.length; i += 4) await Promise.all(sample.slice(i, i + 4).map(inspect));
const table = {};
for (const r of results) { table[r.type] ??= {}; table[r.type][r.state] = (table[r.type][r.state] ?? 0) + 1; }
for (const [t, states] of Object.entries(table)) console.log(`inspect ${t} (${Object.values(states).reduce((a, b) => a + b, 0)} of ${byType[t].length}): ${Object.entries(states).map(([s, n]) => `${s}: ${n}`).join('; ')}`);
// the site's own fixed pages (public paths, no visitor data): how Google last fetched each one, to tell
// a crawl or canonical problem from a plain "not yet" or a quality call
const FIXED = new Set(['home', 'about', 'contact', 'privacy', 'accessibility', 'image-credits', 'music-bingo', 'nyc-happy-hour-index']);
for (const r of results.filter((r) => FIXED.has(r.type))) {
  const x = r.x ?? {};
  console.log(`fixed ${new URL(r.u).pathname}: ${r.state}; crawled ${x.lastCrawlTime?.slice(0, 16) ?? '-'} as ${x.crawledAs ?? '-'}; fetch ${x.pageFetchState ?? '-'}; robots ${x.robotsTxtState ?? '-'}; indexing ${x.indexingState ?? '-'}; canonical ${x.googleCanonical ? (x.googleCanonical === x.userCanonical ? 'same' : `google picked ${x.googleCanonical}`) : '-'}`);
}
const crawled = results.filter((r) => /Crawled - currently not indexed/.test(r.state)).map((r) => r.x?.lastCrawlTime?.slice(0, 10) ?? '-');
if (crawled.length) console.log(`crawled-not-indexed by last crawl date: ${Object.entries(crawled.reduce((a, d) => ((a[d] = (a[d] ?? 0) + 1), a), {})).map(([d, n]) => `${d} ${n}`).join(', ')}`);
const indexed = results.filter((r) => /indexed/i.test(r.state) && !/not indexed/i.test(r.state)).length;
console.log(`indexed in sample: ${indexed}/${results.length}`);
