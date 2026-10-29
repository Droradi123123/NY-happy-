/**
 * Daily analytics export (GitHub Actions, approved Oct 29, 2026): page-level counts only, written to
 * site/src/data/proof.json and committed, so the site can show real proof ("312 people looked at this
 * party this week") and "most read", and keep pages that rank in the index. The repository is public:
 * no queries, no visitors, no cities, nothing about a person; only per-page totals.
 *   views28 / views7: GA4 page views, last 28 and 7 days; tickets28: ticket_click events on the page
 *   search: Google impressions and clicks per page, last 28 days (Search Console)
 * Secrets: GOOGLE_SA_JSON, GA4_PROPERTY_ID. Prints counts only.
 */
import { createSign } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = new URL('../src/data/proof.json', import.meta.url);
const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}');
const prop = (process.env.GA4_PROPERTY_ID || '').trim();
if (!sa.client_email || !prop) { console.log('analytics export: secrets missing, nothing written'); process.exit(0); }
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'RS256', typ: 'JWT' });
const claims = b64({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly' });
const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key, 'base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }) })).json();
if (!tok.access_token) { console.log('analytics export: sign-in failed, nothing written'); process.exit(1); }
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok.access_token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
};
const ga = async (start, dims, metric, filter) => (await post(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, {
  dateRanges: [{ startDate: start, endDate: 'yesterday' }], dimensions: dims.map((name) => ({ name })), metrics: [{ name: metric }], limit: 10000,
  ...(filter ? { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: filter } } } } : {}) })).rows ?? [];
// one path per page: no query string, no trailing slash
const clean = (p) => (p.split(/[?#]/)[0].replace(/\/+$/, '') || '/');
const pages = {};
const add = (p, k, n) => { if (!/^\/[a-z0-9/_-]*$/i.test(p)) return; (pages[p] ??= {})[k] = (pages[p][k] ?? 0) + n; };
for (const r of await ga('28daysAgo', ['pagePath'], 'screenPageViews')) add(clean(r.dimensionValues[0].value), 'views28', Number(r.metricValues[0].value));
for (const r of await ga('7daysAgo', ['pagePath'], 'screenPageViews')) add(clean(r.dimensionValues[0].value), 'views7', Number(r.metricValues[0].value));
for (const r of await ga('28daysAgo', ['pagePath'], 'eventCount', 'ticket_click')) add(clean(r.dimensionValues[0].value), 'tickets28', Number(r.metricValues[0].value));
const search = {};
const sc = await post(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent('sc-domain:yaynyc.com')}/searchAnalytics/query`,
  { startDate: day(30), endDate: day(2), dimensions: ['page'], rowLimit: 5000, dataState: 'all' });
for (const r of sc.rows ?? []) {
  const p = clean(r.keys[0].replace(/^https?:\/\/(www\.)?yaynyc\.com/, ''));
  if (!/^\/[a-z0-9/_-]*$/i.test(p)) continue;
  const s = (search[p] ??= { impressions: 0, clicks: 0 });
  s.impressions += r.impressions; s.clicks += r.clicks;
}
// pages that ever had impressions stay listed (lib/indexScope.ts keeps them indexed)
const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : {};
const everSeen = [...new Set([...(before.everInSearch ?? []), ...Object.keys(search)])].sort();
const out = { updated: day(0), range: { views: '28 and 7 days to yesterday', search: `${day(30)} to ${day(2)}` }, pages, search, everInSearch: everSeen };
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`analytics export: ${Object.keys(pages).length} pages with views, ${Object.keys(search).length} with Google impressions, ${everSeen.length} ever in search`);
