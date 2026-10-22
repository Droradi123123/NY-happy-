/**
 * Google access check (GitHub Actions, run by hand): signs in as the service account in
 * GOOGLE_SA_JSON and reads GA4 (GA4_PROPERTY_ID) and Search Console. The repository is public, so
 * the log shows only whether each read worked and 28-day totals, never the key, page URLs or queries.
 */
import { createSign } from 'node:crypto';

const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}');
const property = (process.env.GA4_PROPERTY_ID || '').trim();
if (!sa.client_email || !sa.private_key) { console.log('GOOGLE_SA_JSON: missing or not a service-account key'); process.exit(1); }

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly' });
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed: ${r.status} ${j.error ?? ''} ${j.error_description ?? ''}`);
  return j.access_token;
}
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const t = await token();
console.log('sign-in: ok');
const auth = { authorization: `Bearer ${t}`, 'content-type': 'application/json' };

// GA4: 28-day totals
if (!property) console.log('GA4: GA4_PROPERTY_ID missing');
else {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, { method: 'POST', headers: auth,
    body: JSON.stringify({ dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }] }) });
  const j = await r.json();
  if (!r.ok) console.log(`GA4: ${r.status} ${j.error?.status ?? ''} ${j.error?.message ?? ''}`);
  else { const v = j.rows?.[0]?.metricValues?.map((m) => m.value) ?? ['0', '0', '0']; console.log(`GA4: ok · last 28 days: sessions ${v[0]}, users ${v[1]}, page views ${v[2]}`); }
}

// Search Console: which properties the account sees, then 28-day totals for yaynyc.com
const s = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: auth });
const sj = await s.json();
if (!s.ok) console.log(`Search Console: ${s.status} ${sj.error?.message ?? ''}`);
else {
  const sites = (sj.siteEntry ?? []).filter((x) => /yaynyc\.com/.test(x.siteUrl));
  console.log(`Search Console: ${sites.length ? sites.map((x) => `${x.siteUrl} (${x.permissionLevel})`).join(', ') : 'no yaynyc.com property shared with the service account'}`);
  const site = sites.find((x) => x.siteUrl.startsWith('sc-domain:')) ?? sites[0];
  if (site) {
    const q = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.siteUrl)}/searchAnalytics/query`, { method: 'POST', headers: auth,
      body: JSON.stringify({ startDate: day(30), endDate: day(3) }) });
    const qj = await q.json();
    const row = qj.rows?.[0];
    console.log(q.ok ? `Search Console: ok · ${day(30)} to ${day(3)}: clicks ${row?.clicks ?? 0}, impressions ${row?.impressions ?? 0}, CTR ${((row?.ctr ?? 0) * 100).toFixed(2)}%, avg position ${(row?.position ?? 0).toFixed(1)}`
      : `Search Console query: ${q.status} ${qj.error?.message ?? ''}`);
  }
}
