/**
 * Deal extraction (GitHub Actions, run by hand). For bars we list without a deal, it reads the bar's
 * own source again: the rendered page and its iframes, menus linked as PDFs (pdftotext, or OCR when
 * the PDF is a scan), and menu images on the page (tesseract OCR). When the source page has no
 * happy-hour passage it follows up to 3 menu / happy-hour links on the same site.
 *
 * Writes site/rechecks/deal-candidates.json: one entry per bar with the happy-hour passage quoted
 * verbatim, where it was read (page, pdf or image, with the URL) and when, and the item/price pairs,
 * window and days deal-parse.mjs suggests from that passage. Nothing here publishes anything: each
 * candidate is reviewed against its quote before it is written to the database with its source.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readDeal } from './deal-parse.mjs';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const MAX = Number(process.env.EXTRACT_MAX ?? 400);
const BUDGET = Number(process.env.EXTRACT_BUDGET_MIN ?? 40) * 60e3;
const OUT = 'rechecks/deal-candidates.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 YaYNYC-check/1.0 (+https://yaynyc.com/about)';
const TMP = '/tmp/deal-extract';
mkdirSync(TMP, { recursive: true });

const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/site_bars?select=slug,name,hood,hh,hh_source,hh_checked,website`, { headers: { apikey: PUBLIC_KEY } })).json();
// "no deal" the way the site decides it (lib/data.ts dealKnown): no offers, no discount, no 2-for-1
const noDeal = (hh) => !(hh?.offers ?? []).length && !hh?.drinks_discount && !hh?.food_discount && !hh?.two_for_one;
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : [];
const prevAt = new Map(prev.map((c) => [c.slug, c.at]));
const todo = rows
  .filter((r) => r.hh_source && noDeal(r.hh))
  // bars never read by this job first, then the ones read longest ago
  .sort((a, b) => (prevAt.get(a.slug) ?? '').localeCompare(prevAt.get(b.slug) ?? '') || a.slug.localeCompare(b.slug))
  .slice(0, MAX);
const live = new Set(rows.filter((r) => noDeal(r.hh)).map((r) => r.slug));
console.log(`extract: ${todo.length} of ${live.size} bars without a deal`);

const run = (cmd, args, timeout = 60000) => execFileSync(cmd, args, { encoding: 'utf-8', timeout, maxBuffer: 32e6, stdio: ['ignore', 'pipe', 'ignore'] });
let n = 0;
const tmp = (ext) => `${TMP}/f${n++}.${ext}`;

function ocr(file) {
  try { return run('tesseract', [file, '-', '-l', 'eng', '--psm', '4'], 90000); } catch (e) { console.log(`ocr failed: ${String(e?.message ?? e).slice(0, 120)}`); return ''; }
}
async function fetchTo(url, ext) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000 || buf.length > 25e6) return null;
  const f = tmp(ext);
  writeFileSync(f, buf);
  return f;
}
async function readPdf(url) {
  try {
    const f = await fetchTo(url, 'pdf');
    if (!f) return '';
    let text = run('pdftotext', ['-layout', '-l', '6', f, '-'], 30000);
    // a scanned menu has no text layer: render the first pages and OCR them
    if (text.replace(/\s/g, '').length < 150) {
      const base = tmp('p');
      run('pdftoppm', ['-r', '200', '-f', '1', '-l', '3', '-png', f, base], 60000);
      text = '';
      for (let i = 1; i <= 3; i++) for (const s of [`${base}-${i}.png`, `${base}-0${i}.png`]) if (existsSync(s)) text += '\n' + ocr(s);
    }
    return text;
  } catch { return ''; }
}
// menu images come as webp, avif or jpeg from CDNs that check the referrer: fetch them through the
// browser context, then sharp turns them into a large grayscale PNG, which is what tesseract reads best
async function readImage(url) {
  try {
    const r = await ctx.request.get(url, { timeout: 30000 });
    if (!r.ok()) return { text: '', err: `http ${r.status()}` };
    const buf = await r.body();
    if (buf.length < 5000) return { text: '', err: 'too small' };
    const f = tmp('png');
    await sharp(buf, { animated: false }).resize({ width: 2200 }).grayscale().normalize().png().toFile(f);
    const text = ocr(f);
    return text.trim() ? { text } : { text: '', err: 'no text' };
  } catch (e) { return { text: '', err: String(e?.message ?? e).slice(0, 80) }; }
}

const MENU_WORD = /happy|\bhh\b|special|drink|cocktail|bar[-_ ]?menu|beverage|wine|beer|aperitivo|menu/i;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 2000 }, locale: 'en-US' });
await ctx.route('**/*', (r) => (['media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()));

/** Every text a page offers: [{ from: 'page'|'pdf'|'image', url, text }], plus its menu links. */
async function readSource(url) {
  if (/\.pdf(\?|$)/i.test(url)) return { ok: true, texts: [{ from: 'pdf', url, text: await readPdf(url) }], links: [] };
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || res.status() >= 400) return { ok: false, texts: [], links: [] };
    if ((res.headers()['content-type'] ?? '').includes('pdf')) return { ok: true, texts: [{ from: 'pdf', url, text: await readPdf(url) }], links: [] };
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // lazy-loaded menu images appear once scrolled into view
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight && y < 20000; y += 1500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } }).catch(() => {});
    let text = await page.evaluate(() => document.body?.innerText ?? '');
    for (const f of page.frames().slice(1)) text += '\n' + (await f.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
    const found = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const near = (el) => { let t = ''; for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) t += ' ' + (e.getAttribute?.('aria-label') ?? '') + ' ' + (e.previousElementSibling?.textContent ?? '').slice(0, 80); return t; };
      const imgs = [...document.images].filter((i) => i.naturalWidth >= 450 && i.naturalHeight >= 350 && i.currentSrc && !/logo|icon|avatar/i.test(i.currentSrc))
        .map((i) => ({ src: i.currentSrc, area: i.naturalWidth * i.naturalHeight, hint: re.test(`${i.currentSrc} ${i.alt} ${i.title} ${near(i)}`) }));
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.textContent ?? '').trim().slice(0, 60) }))
        .filter((a) => /^https?:/.test(a.href) && re.test(`${a.text} ${a.href}`));
      return { imgs, links };
    }, MENU_WORD.source);
    const texts = [{ from: 'page', url, text }];
    const pdfs = [...new Set(found.links.filter((l) => /\.pdf(\?|$)/i.test(l.href)).map((l) => l.href))].slice(0, 3);
    for (const p of pdfs) texts.push({ from: 'pdf', url: p, text: await readPdf(p) });
    // menu images: the ones named or captioned like a menu; on a menu page, the largest ones
    const menuPage = MENU_WORD.test(new URL(url).pathname);
    const imgs = [...new Map(found.imgs.map((i) => [i.src, i])).values()].filter((i) => i.hint || menuPage).sort((a, b) => Number(b.hint) - Number(a.hint) || b.area - a.area).slice(0, 4);
    for (const i of imgs) texts.push({ from: 'image', url: i.src, ...(await readImage(i.src)) });
    const host = new URL(url).hostname.replace(/^www\./, '');
    const links = [...new Set(found.links.filter((l) => !/\.pdf(\?|$)/i.test(l.href) && new URL(l.href).hostname.replace(/^www\./, '') === host && l.href.split('#')[0] !== url.split('#')[0])
      .sort((a, b) => Number(/happy/i.test(`${b.text} ${b.href}`)) - Number(/happy/i.test(`${a.text} ${a.href}`))).map((l) => l.href.split('#')[0]))].slice(0, 3);
    return { ok: true, texts, links };
  } catch { return { ok: false, texts: [], links: [] }; }
  finally { await page.close().catch(() => {}); }
}

const worth = (d) => (d ? d.offers.length * 2 + (d.window ? 3 : 0) + (d.days ? 1 : 0) + (d.discount_pct || d.two_for_one ? 2 : 0) : -1);
async function extract(bar) {
  const seen = [];
  const first = await readSource(bar.hh_source);
  seen.push(...first.texts);
  let reads = seen.map((t) => ({ ...t, deal: readDeal(t.text) }));
  if (!reads.some((r) => r.deal?.offers.length)) {
    for (const l of first.links) {
      const more = await readSource(l);
      reads.push(...more.texts.map((t) => ({ ...t, deal: readDeal(t.text) })));
      if (reads.some((r) => r.deal?.offers.length)) break;
    }
  }
  const hits = reads.filter((r) => r.deal).sort((a, b) => worth(b.deal) - worth(a.deal));
  const best = hits[0];
  return {
    slug: bar.slug, name: bar.name, hood: bar.hood, source: bar.hh_source, at: new Date().toISOString(),
    status: !first.ok && !hits.length ? 'unreachable' : best ? (best.deal.offers.length ? 'offers' : 'passage') : 'no_passage',
    read: reads.map((r) => ({ from: r.from, url: r.url, chars: r.text.length, ...(r.err ? { err: r.err } : {}) })),
    stored: { start: bar.hh?.start ?? null, end: bar.hh?.end ?? null, days: bar.hh?.days ?? null },
    best: best ? { from: best.from, url: best.url, ...best.deal } : null,
    also: hits.slice(1, 3).map((h) => ({ from: h.from, url: h.url, block: h.deal.block.slice(0, 500), offers: h.deal.offers })),
  };
}

const out = new Map(prev.filter((c) => live.has(c.slug)).map((c) => [c.slug, c]));
const queue = [...todo], t0 = Date.now();
const within = (p, ms, slug) => Promise.race([p, new Promise((ok) => setTimeout(() => ok({ slug, status: 'timeout', at: new Date().toISOString() }), ms))]);
let done = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  for (let b; Date.now() - t0 < BUDGET && (b = queue.shift()); ) {
    const r = await within(extract(b), 150000, b.slug);
    if (r.status !== 'timeout' || !out.has(b.slug)) out.set(b.slug, { name: b.name, hood: b.hood, source: b.hh_source, ...r });
    if (++done % 25 === 0) console.log(`extract: ${done} read`);
  }
}));
await browser.close();
rmSync(TMP, { recursive: true, force: true });

const list = [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug));
mkdirSync('rechecks', { recursive: true });
writeFileSync(OUT, JSON.stringify(list, null, 1));
const count = (s) => list.filter((c) => c.status === s).length;
console.log(`extract: ${done} read this run, ${queue.length} left for the next run`);
console.log(`extract: ${list.length} bars on file · offers ${count('offers')} · passage only ${count('passage')} · no passage ${count('no_passage')} · unreachable ${count('unreachable')} · timeout ${count('timeout')}`);
console.log(`extract: read from images ${list.filter((c) => c.best?.from === 'image').length} · from PDFs ${list.filter((c) => c.best?.from === 'pdf').length}`);
