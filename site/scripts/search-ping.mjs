/**
 * Tell search engines about every page (GitHub Actions, run by hand or after big content changes):
 * IndexNow with every URL in the live sitemap (Bing, and through it ChatGPT search; also Yandex,
 * Seznam, Naver), and the sitemap itself to Bing Webmaster Tools (BING_API_KEY). Logs statuses only.
 */
import { readFileSync } from 'node:fs';

const SITE = 'https://yaynyc.com';
const key = readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf-8').match(/INDEXNOW_KEY = '([0-9a-f]+)'/)?.[1];
const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`sitemap: ${urls.length} URLs`);
const keyFile = await fetch(`${SITE}/${key}.txt`);
console.log(`indexnow key file: HTTP ${keyFile.status}`);
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'yaynyc.com', key, keyLocation: `${SITE}/${key}.txt`, urlList: urls.slice(i, i + 10000) }) });
  console.log(`indexnow: ${Math.min(10000, urls.length - i)} URLs, HTTP ${r.status}`);
}
const bing = (process.env.BING_API_KEY || '').trim();
if (bing) {
  const api = (m) => `https://ssl.bing.com/webmaster/api.svc/json/${m}?apikey=${bing}`;
  const feed = await fetch(api('SubmitFeed'), { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteUrl: `${SITE}/`, feedUrl: `${SITE}/sitemap.xml` }) });
  console.log(`bing sitemap submit: HTTP ${feed.status}`);
  const q = await (await fetch(`${api('GetUrlSubmissionQuota')}&siteUrl=${encodeURIComponent(SITE + '/')}`)).json().catch(() => ({}));
  const daily = q.d?.DailyQuota ?? 0;
  console.log(`bing url quota today: ${daily}`);
  // the most valuable pages first: hubs, parties, guides, then the rest
  const order = (u) => (/\/parties\/|\/blog\//.test(u) ? 0 : /\/happy-hours\/?$|\/parties\/?$|yaynyc\.com\/?$/.test(u) ? -1 : 1);
  const batch = [...urls].sort((a, b) => order(a) - order(b)).slice(0, Math.min(daily, 500));
  if (batch.length) {
    const r = await fetch(api('SubmitUrlBatch'), { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteUrl: `${SITE}/`, urlList: batch }) });
    console.log(`bing url batch: ${batch.length} URLs, HTTP ${r.status}`);
  }
} else console.log('BING_API_KEY missing');
