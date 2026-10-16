/**
 * Rendered deal re-check (GitHub Actions, daily). The database re-reads each bar's source page with a
 * plain HTTP fetch; pages that build their menu in JavaScript, sit in an iframe or a PDF come back
 * "inconclusive" there. This opens them in a real browser (and PDFs with pdftotext), reads the text,
 * and looks for the plain prices we publish, as numbers.
 *
 * Writes site/rechecks/latest.json: [{ slug, url, at, verdict, found, missing, page_prices, method }].
 * The database pulls that file (bar_recheck_pull / bar_recheck_import) and applies the same rules as
 * its own re-check: only "confirmed" moves a deal's date. Nothing here can write to the database.
 *
 * Verdicts: confirmed (every price found), partial, changed (prices on the page, none of ours),
 * inconclusive (no prices in the text: image menus), unreachable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const MAX = Number(process.env.RECHECK_MAX ?? 400);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 YaYNYC-check/1.0 (+https://yaynyc.com/about)';

const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/site_bars?select=slug,hh,hh_source,hh_checked,hh_recheck`, { headers: { apikey: PUBLIC_KEY } })).json();
const needlesOf = (hh) => [...new Set((hh?.offers ?? [])
  .filter((o) => (o.kind ?? 'fixed') === 'fixed' && /^\$\s*\d+(\.\d{1,2})?$/.test(o.price ?? ''))
  .map((o) => String(Number(o.price.replace(/[^0-9.]/g, '')))))];
const age = (d) => (d ? (Date.now() - Date.parse(d)) / 864e5 : 999);
// deals without a plain price ("50% off", "2-for-1", times only) are checked by what the page must
// still say: the words "happy hour", the window ("4-7pm", "4pm to 7pm", "16:00-19:00") and the discount
const h12 = (t) => { const [h, m] = t.split(':').map(Number); return { h: h % 12 || 12, m, h24: h }; };
function windowRe(w) {
  if (!w?.start || !w?.end || w.start === 'open') return null;
  const a = h12(w.start), b = h12(w.end);
  const part = (x) => `(?:${x.h}(?:[:.]${String(x.m).padStart(2, '0')})?|${String(x.h24).padStart(2, '0')}[:.]${String(x.m).padStart(2, '0')})`;
  return new RegExp(`\\b${part(a)}\\s*(?:[ap]\\.?m\\.?)?\\s*(?:-|–|—|to|until|till)\\s*${part(b)}(?![0-9])`, 'i');
}
const discountsOf = (hh) => (hh?.offers ?? []).flatMap((o) => (/(\d+)\s*%/.test(o.price ?? '') ? [`${o.price.match(/(\d+)\s*%/)[1]}%`] : []))
  .concat(hh?.two_for_one ? ['2-for-1'] : []);
// the bars the plain fetch could not settle first, then the oldest checks
const windowsOf = (hh) => (hh?.windows?.length ? hh.windows : [{ start: hh?.start, end: hh?.end }]);
const todo = rows
  .filter((r) => r.hh_source && (needlesOf(r.hh).length || windowsOf(r.hh).some(windowRe)))
  .map((r) => ({ ...r, needles: needlesOf(r.hh), prio: ['inconclusive', 'unreachable', 'changed', 'partial'].includes(r.hh_recheck?.verdict) ? 0 : age(r.hh_checked) > 7 ? 1 : 2 }))
  .filter((r) => r.prio < 2)
  .sort((a, b) => a.prio - b.prio || age(b.hh_checked) - age(a.hh_checked))
  .slice(0, MAX);
console.log(`recheck: ${todo.length} of ${rows.length} bars`);

const pricesIn = (t) => [...t.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
function verdictOf(needles, text, reachable, hh) {
  if (!reachable) return { verdict: 'unreachable', found: [], missing: needles, page_prices: 0 };
  if (!needles.length) {
    // no plain price: confirmed only when the page still names the happy hour, its window and its discount
    const hasHH = /happy\s*hour|aperitivo|apéritif|aperitif/i.test(text);
    const win = windowsOf(hh).map(windowRe).filter(Boolean);
    const winOk = win.length > 0 && win.some((re) => re.test(text));
    const disc = discountsOf(hh);
    const discOk = disc.every((d) => (d === '2-for-1' ? /2\s*(?:-|for|x)\s*1|two\s*for\s*one|buy one,? get one|bogo/i.test(text) : text.includes(d)));
    return { verdict: hasHH && winOk && discOk ? 'confirmed' : 'inconclusive', found: hasHH && winOk ? ['window'].concat(discOk ? disc : []) : [], missing: [], page_prices: pricesIn(text).length };
  }
  const have = new Set(pricesIn(text));
  const found = needles.filter((n) => have.has(Number(n))), missing = needles.filter((n) => !have.has(Number(n)));
  const verdict = !missing.length ? 'confirmed' : found.length ? 'partial' : have.size >= 3 ? 'changed' : 'inconclusive';
  return { verdict, found, missing, page_prices: have.size };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 2000 }, locale: 'en-US' });
await ctx.route('**/*', (r) => (['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()));

async function readPage(url) {
  // PDFs (many menus): download and read with pdftotext
  if (/\.pdf(\?|$)/i.test(url)) return readPdf(url);
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || res.status() >= 400) return { ok: false, text: '' };
    if ((res.headers()['content-type'] ?? '').includes('pdf')) return readPdf(url);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    let text = await page.evaluate(() => document.body?.innerText ?? '');
    for (const f of page.frames().slice(1)) text += '\n' + (await f.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
    // a menu linked as a PDF from this page counts as the page's own text
    if (pricesIn(text).length < 3) {
      const pdfs = await page.$$eval('a[href$=".pdf" i], a[href*=".pdf?" i]', (as) => as.map((a) => a.href).slice(0, 3));
      for (const p of pdfs) text += '\n' + (await readPdf(p)).text;
    }
    return { ok: true, text };
  } catch { return { ok: false, text: '' }; }
  finally { await page.close(); }
}
async function readPdf(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, text: '' };
    const f = `/tmp/m-${Math.random().toString(36).slice(2)}.pdf`;
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    return { ok: true, text: execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf-8', timeout: 20000 }) };
  } catch { return { ok: false, text: '' }; }
}

const out = [];
const queue = [...todo];
// a hard limit per page (some sites never settle) and a budget for the run: it stops starting new
// pages after BUDGET minutes and saves what it has, so a slow night never loses the whole run
const BUDGET = Number(process.env.RECHECK_BUDGET_MIN ?? 22) * 60e3, t0 = Date.now();
const within = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok({ ok: false, text: '' }), ms))]);
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let b; Date.now() - t0 < BUDGET && (b = queue.shift()); ) {
    const { ok, text } = await within(readPage(b.hh_source), 45000);
    out.push({ slug: b.slug, url: b.hh_source, at: new Date().toISOString(), method: 'rendered', ...verdictOf(b.needles, text, ok, b.hh) });
  }
}));
await browser.close();

mkdirSync('rechecks', { recursive: true });
writeFileSync('rechecks/latest.json', JSON.stringify(out));
const n = (v) => out.filter((o) => o.verdict === v).length;
console.log(`recheck: ${out.length} read, ${queue.length} left for the next run`);
console.log(`recheck: confirmed ${n('confirmed')}, partial ${n('partial')}, changed ${n('changed')}, inconclusive ${n('inconclusive')}, unreachable ${n('unreachable')}`);
