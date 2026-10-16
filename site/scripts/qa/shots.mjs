/**
 * QA only: serve a built dist folder, then take phone and desktop screenshots of the given paths and
 * check each for horizontal overflow, tab order reaching the content, and console errors.
 *   node scripts/qa/shots.mjs <dist> <outdir> /trivia /bars/x ...
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const [dist, out, ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const cands = [join(dist, u), join(dist, `${u}.html`), join(dist, u, 'index.html')];
  const f = cands.find((c) => existsSync(c) && statSync(c).isFile());
  if (!f) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(4329);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const results = [];
for (const [label, viewport] of [['phone', { width: 375, height: 812 }], ['desktop', { width: 1280, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, timezoneId: 'America/New_York' });
  // external requests (map tiles, analytics, fonts from CDNs) are blocked: the sandbox has no internet
  await ctx.route('**/*', (r) => (r.request().url().startsWith('http://localhost:4329') ? r.continue() : r.abort()));
  for (const p of paths) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:4329${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // keyboard: tab until focus lands inside <main>
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement?.closest('main')); }
    const name = `${label}${p.replace(/\//g, '_') || '_home'}.png`;
    await page.screenshot({ path: join(out, name), fullPage: label === 'phone' ? false : false });
    results.push({ view: label, path: p, overflowPx: overflow, keyboardReachesMain: reached, jsErrors: errors });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log(JSON.stringify(results, null, 1));
