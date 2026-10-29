/**
 * Live check of yaynyc.com (GitHub Actions: after every push, and every 6 hours).
 *  1. with --wait-for <sha>: waits (up to 20 minutes) until /build.json names that commit or a newer one,
 *     so the check runs on the deploy it is about; fails if the push never goes live
 *  2. every URL in the sitemap answers 200, without noindex (meta tag or X-Robots-Tag), canonical to itself
 *  3. the main flows open on a 390px phone (Playwright): no horizontal scroll, no JavaScript errors, and
 *     the thing the page is for is there (party cards, a ticket button, bar rows)
 * Writes live-check.json and live-check.md (the job summary). Exit 1 on any failure.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'https://yaynyc.com';
const UA = 'Mozilla/5.0 (compatible; YaYNYC-live-check/1.0; +https://github.com/Droradi123123/NY-happy-)';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u, opts = {}) => fetch(u, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30000), ...opts });
const report = { checked: new Date().toISOString(), deploy: null, sitemap: { urls: 0, bad: [] }, flows: [], ok: true };
const fail = (where, msg) => { report.ok = false; console.log(`✗ ${where}: ${msg}`); };

// ---- 1. the deploy ----
const want = arg('--wait-for');
const isAtOrAfter = (live) => { try { execSync(`git merge-base --is-ancestor ${want} ${live}`, { stdio: 'ignore' }); return true; } catch { return false; } };
for (let t = 0; ; t++) {
  const b = await get(`${SITE}/build.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  report.deploy = b;
  if (!want) break;
  if (b?.commit && (b.commit === want || isAtOrAfter(b.commit))) { console.log(`deploy live: ${b.commit.slice(0, 7)} (built ${b.built})`); break; }
  if (t >= 40) { fail('deploy', `${want.slice(0, 7)} is not live after 20 minutes (live: ${b?.commit?.slice(0, 7) ?? 'unknown'})`); break; }
  await sleep(30000);
}

// ---- 2. the sitemap ----
const sm = await get(`${SITE}/sitemap.xml`).then((r) => r.text());
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
report.sitemap.urls = urls.length;
if (urls.length < 500) fail('sitemap', `only ${urls.length} URLs`);
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < urls.length) {
    const u = urls[next++];
    let problem = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await get(u);
        const html = r.status === 200 ? await r.text() : '';
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
        problem = r.status !== 200 ? `${r.status}${r.headers.get('location') ? ` -> ${r.headers.get('location')}` : ''}`
          : /noindex/i.test(r.headers.get('x-robots-tag') ?? '') ? 'X-Robots-Tag noindex'
          : /<meta name="robots" content="noindex/.test(html) ? 'meta noindex'
          : canonical && canonical !== u ? `canonical ${canonical}` : null;
        if (!problem || r.status < 500) break;
      } catch (e) { problem = String(e.message ?? e).slice(0, 80); }
      await sleep(2000);
    }
    if (problem) report.sitemap.bad.push({ url: u.replace(SITE, ''), problem });
  }
}));
if (report.sitemap.bad.length) fail('sitemap', `${report.sitemap.bad.length} of ${urls.length} URLs: ${report.sitemap.bad.slice(0, 5).map((b) => `${b.url} (${b.problem})`).join(', ')}`);
else console.log(`sitemap: ${urls.length} URLs, all 200, indexable, self-canonical`);

// ---- 3. main flows on a phone ----
const pick = (re) => urls.map((u) => u.replace(SITE, '')).find((u) => re.test(u));
const FLOWS = [
  ['/', 'a[href^="/parties"], a[href^="/happy-hours"]'],
  ['/happy-hours', 'a[href^="/bars/"]'],
  ['/happy-hours/now', 'main'],
  ['/parties', 'a[href^="/parties/"]'],
  ['/parties/tonight', 'main a[href^="/parties/"]'],
  [pick(/^\/parties\/[^/]+-\d{4}-\d{2}-\d{2}$/), 'a[data-ev="tickets"]'],
  [pick(/^\/bars\//), 'h1'],
  [pick(/^\/happy-hours\/(williamsburg|east-village|west-village)$/) ?? pick(/^\/happy-hours\/[a-z-]+$/), 'a[href^="/bars/"]'],
].filter(([p]) => p);
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: `${UA} Mobile` });
for (const [path, need] of FLOWS) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|googletagmanager|google-analytics|net::ERR/i.test(m.text())) errors.push(m.text()); });
  const row = { path, ok: true, notes: [] };
  try {
    const r = await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(1500);
    if (r?.status() !== 200) row.notes.push(`status ${r?.status()}`);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 390) row.notes.push(`page is ${width}px wide (horizontal scroll)`);
    if (!(await page.locator(need).count())) row.notes.push(`missing ${need}`);
  } catch (e) { row.notes.push(String(e.message ?? e).split('\n')[0].slice(0, 120)); }
  if (errors.length) row.notes.push(`JS errors: ${errors.slice(0, 3).join(' | ').slice(0, 200)}`);
  row.ok = !row.notes.length;
  if (!row.ok) fail(`mobile ${path}`, row.notes.join('; '));
  else console.log(`mobile ${path}: ok`);
  report.flows.push(row);
  await page.close();
}
await browser.close();

writeFileSync('live-check.json', JSON.stringify(report, null, 1));
writeFileSync('live-check.md', [
  `## Live check ${report.ok ? '✓' : '✗'} (${report.checked.slice(0, 16).replace('T', ' ')} UTC)`, '',
  `- Deploy: ${report.deploy?.commit?.slice(0, 7) ?? 'unknown'}, built ${report.deploy?.built ?? '?'}`,
  `- Sitemap: ${report.sitemap.urls} URLs, ${report.sitemap.bad.length} with a problem`,
  ...report.sitemap.bad.slice(0, 30).map((b) => `  - ${b.url}: ${b.problem}`),
  `- Phone (390px): ${report.flows.filter((f) => f.ok).length} of ${report.flows.length} flows ok`,
  ...report.flows.filter((f) => !f.ok).map((f) => `  - ${f.path}: ${f.notes.join('; ')}`), '',
].join('\n'));
process.exit(report.ok ? 0 : 1);
