/**
 * Analytics pull (GitHub Actions, run by hand): Search Console, GA4, PageSpeed/CrUX and Bing Webmaster
 * data for yaynyc.com, written to report.json for the workflow to encrypt before it is committed. The
 * repository is public: nothing here is printed except which sources answered.
 *
 * Secrets: GOOGLE_SA_JSON + GA4_PROPERTY_ID (service account), GOOGLE_API_KEY (PageSpeed, CrUX),
 * BING_API_KEY (Bing Webmaster). A missing secret skips that source.
 */
import { createSign } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const SITE = 'https://yaynyc.com';
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const out = { pulled: new Date().toISOString(), sources: {} };
const note = (k, v) => { out.sources[k] = v; console.log(`${k}: ${v}`); };

// ---- Google sign-in (service account) ----
const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}');
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
  if (!j.access_token) throw new Error(`sign-in ${r.status}`);
  return j.access_token;
}
const post = async (url, body, headers) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }; };

if (sa.client_email) {
  const auth = { authorization: `Bearer ${await token()}` };

  // ---- Search Console: this 28 days vs the 28 before, by query, page, query+page, date, device, country ----
  const site = 'sc-domain:yaynyc.com';
  const gsc = async (startDate, endDate, dimensions, rowLimit = 5000) => {
    const r = await post(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate, endDate, dimensions, rowLimit, dataState: 'all' }, auth);
    return r.ok ? (r.j.rows ?? []).map((x) => ({ k: x.keys, c: x.clicks, i: x.impressions, p: Math.round(x.position * 10) / 10 })) : { error: r.status, message: r.j.error?.message };
  };
  const cur = [day(29), day(2)], prev = [day(57), day(30)];
  out.gsc = {
    range: cur, prevRange: prev,
    total: await gsc(...cur, []), totalPrev: await gsc(...prev, []),
    byDate: await gsc(day(90), day(2), ['date']),
    query: await gsc(...cur, ['query']), queryPrev: await gsc(...prev, ['query']),
    page: await gsc(...cur, ['page']), pagePrev: await gsc(...prev, ['page']),
    queryPage: await gsc(...cur, ['query', 'page'], 10000),
    device: await gsc(...cur, ['device']), country: await gsc(...cur, ['country'], 30),
  };
  note('search_console', Array.isArray(out.gsc.query) ? `ok (${out.gsc.query.length} queries, ${out.gsc.page.length} pages)` : 'error');

  // ---- Index coverage: the sitemaps Google has, and URL Inspection on a sample of each page type ----
  const sm = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`, { headers: auth });
  out.sitemaps = sm.ok ? ((await sm.json()).sitemap ?? []).map((x) => ({ path: x.path, submitted: x.lastSubmitted, downloaded: x.lastDownloaded, errors: x.errors, warnings: x.warnings, contents: x.contents })) : { error: sm.status };
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text().catch(() => '');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const typeOf = (u) => { const p = new URL(u).pathname.split('/').filter(Boolean); return p.length ? (p[0] === 'happy-hours' && p[1] === 'near' ? 'near' : p[0] === 'parties' && p[1] === 'venue' ? 'venue' : p[0]) : 'home'; };
  const byType = {};
  for (const u of urls) (byType[typeOf(u)] ??= []).push(u);
  const sample = Object.values(byType).flatMap((list) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / 25)) === 0).slice(0, 25));
  out.inspect = { sitemapUrls: urls.length, byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])), rows: [] };
  for (const u of sample) {
    const r = await post('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: u, siteUrl: site }, auth);
    const s = r.j.inspectionResult?.indexStatusResult ?? {};
    out.inspect.rows.push(r.ok ? { url: u, type: typeOf(u), verdict: s.verdict, coverage: s.coverageState, crawled: s.lastCrawlTime, canonical: s.googleCanonical, robots: s.robotsTxtState, fetch: s.pageFetchState }
      : { url: u, type: typeOf(u), error: r.status });
  }
  note('url_inspection', `${out.inspect.rows.filter((x) => !x.error).length}/${sample.length} inspected`);

  // ---- GA4 ----
  const prop = (process.env.GA4_PROPERTY_ID || '').trim();
  if (prop) {
    const ga = async (dimensions, metrics, extra = {}) => {
      const r = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: 2000, ...extra }, auth);
      return r.ok ? (r.j.rows ?? []).map((x) => [...(x.dimensionValues ?? []).map((d) => d.value), ...x.metricValues.map((m) => Number(m.value))]) : { error: r.status, message: r.j.error?.message };
    };
    const M = ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate', 'averageSessionDuration', 'bounceRate'];
    out.ga4 = {
      metrics: M,
      total: await ga([], M),
      byDate: await ga(['date'], ['sessions', 'activeUsers'], { dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }] }),
      channel: await ga(['sessionDefaultChannelGroup'], M),
      sourceMedium: await ga(['sessionSourceMedium'], M),
      landing: await ga(['landingPagePlusQueryString'], M),
      page: await ga(['pagePath'], ['screenPageViews', 'activeUsers', 'userEngagementDuration']),
      device: await ga(['deviceCategory'], M),
      city: await ga(['city', 'country'], ['sessions']),
      newVsReturning: await ga(['newVsReturning'], ['activeUsers', 'sessions']),
      events: await ga(['eventName'], ['eventCount', 'totalUsers']),
      eventsByPage: await ga(['eventName', 'pagePath'], ['eventCount']),
      outbound: await ga(['linkDomain'], ['eventCount'], { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'click' } } } }),
      // cross-cuts for the analyst report: where each source lands, what each source does, by day
      landingBySource: await ga(['sessionSource', 'landingPagePlusQueryString'], ['sessions', 'engagedSessions']),
      eventsByChannel: await ga(['sessionDefaultChannelGroup', 'eventName'], ['eventCount', 'totalUsers']),
      dateByChannel: await ga(['date', 'sessionDefaultChannelGroup'], ['sessions'], { dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }] }),
      cityBySource: await ga(['sessionDefaultChannelGroup', 'city'], ['sessions', 'engagedSessions']),
      hourOfDay: await ga(['hour'], ['sessions']),
      dayOfWeek: await ga(['dayOfWeek'], ['sessions']),
      browser: await ga(['browser', 'operatingSystem'], ['sessions']),
    };
    note('ga4', Array.isArray(out.ga4.total) ? 'ok' : `error ${out.ga4.total.error}`);
  } else note('ga4', 'GA4_PROPERTY_ID missing');
} else note('google', 'GOOGLE_SA_JSON missing');

// ---- PageSpeed Insights (lab, mobile) and CrUX (real users, origin) ----
const key = (process.env.GOOGLE_API_KEY || '').trim();
if (key) {
  const urls = ['/', '/happy-hours', '/happy-hours/now', '/parties', '/parties/halloween', '/bars/the-wren-nolita', '/blog/what-time-do-bars-close-in-nyc'];
  out.psi = [];
  for (const u of urls) {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(SITE + u)}&strategy=mobile&category=performance&category=seo&key=${key}`);
    const j = await r.json().catch(() => ({}));
    const a = j.lighthouseResult?.audits ?? {};
    out.psi.push(r.ok ? { url: u, perf: j.lighthouseResult?.categories?.performance?.score, seo: j.lighthouseResult?.categories?.seo?.score,
      lcp: a['largest-contentful-paint']?.numericValue, cls: a['cumulative-layout-shift']?.numericValue, tbt: a['total-blocking-time']?.numericValue,
      field: j.loadingExperience?.metrics ? Object.fromEntries(Object.entries(j.loadingExperience.metrics).map(([k, v]) => [k, { p75: v.percentile, cat: v.category }])) : null }
      : { url: u, error: r.status, message: j.error?.message });
  }
  const c = await post(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, { origin: SITE, formFactor: 'PHONE' }, {});
  out.crux = c.ok ? Object.fromEntries(Object.entries(c.j.record?.metrics ?? {}).map(([k, v]) => [k, v.percentiles?.p75])) : { error: c.status, message: c.j.error?.message };
  note('pagespeed', `${out.psi.filter((x) => !x.error).length}/${urls.length} pages`);
  note('crux', c.ok ? 'ok' : `no data (${c.status})`);
} else note('pagespeed', 'GOOGLE_API_KEY missing');

// ---- Bing Webmaster ----
const bing = (process.env.BING_API_KEY || '').trim();
if (bing) {
  const call = async (m) => { const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${m}?siteUrl=${encodeURIComponent(SITE + '/')}&apikey=${bing}`); const j = await r.json().catch(() => ({})); return r.ok ? j.d ?? j : { error: r.status, message: j.Message ?? j.message }; };
  out.bing = { query: await call('GetQueryStats'), page: await call('GetPageStats'), traffic: await call('GetRankAndTrafficStats'), crawl: await call('GetCrawlStats') };
  note('bing', Array.isArray(out.bing.query) ? `ok (${out.bing.query.length} query rows)` : `error ${out.bing.query?.error ?? ''}`);
} else note('bing', 'BING_API_KEY missing');

note('supabase_service_key', process.env.SUPABASE_SERVICE_KEY ? 'set' : 'missing');
writeFileSync('report.json', JSON.stringify(out));
