/**
 * Tell search engines about every page (GitHub Actions, run by hand or after big content changes):
 * IndexNow with every URL in the live sitemap (Bing, and through it ChatGPT search; also Yandex,
 * Seznam, Naver), and the sitemap itself to Bing Webmaster Tools (BING_API_KEY). Logs statuses only.
 */
import { readFileSync } from 'node:fs';

const SITE = 'https://yaynyc.com';
const key = readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf-8').match(/INDEXNOW_KEY = '([0-9a-f]+)'/)?.[1];
// every indexable page (sitemap-full.xml), not only the Google core in sitemap.xml
const xml = await (await fetch(`${SITE}/sitemap-full.xml`)).text();
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
  const feed = await fetch(api('SubmitFeed'), { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteUrl: `${SITE}/`, feedUrl: `${SITE}/sitemap-full.xml` }) });
  console.log(`bing sitemap submit: HTTP ${feed.status}`);
  const q = await (await fetch(`${api('GetUrlSubmissionQuota')}&siteUrl=${encodeURIComponent(SITE + '/')}`)).json().catch(() => ({}));
  const daily = q.d?.DailyQuota ?? 0;
  console.log(`bing url quota today: ${daily}`);
  // Bing's quota is small (100 a day for this site). The hubs and the timely lists go every day; the rest of the
  // sitemap rotates, a new slice each day, parties and guides first, so every page is submitted within about
  // two weeks instead of the same first 100 every day.
  const cap = Math.min(daily, 500);
  const always = urls.filter((u) => /yaynyc\.com\/?$|\/parties\/?$|\/happy-hours\/?$|\/parties\/(tonight|tomorrow|this-weekend|next-weekend|calendar|new-years-eve|thanksgiving-eve|thanksgiving-weekend|christmas)\/?$/.test(u)).slice(0, cap);
  // Nov 10: the holiday season first. ChatGPT sends most of its visitors to holiday pages (Halloween: ~2,450 landings
  // in 28 days), so the NYE and Thanksgiving Eve filter pages, the price index, those nights' date pages and the
  // nights themselves go right after the hubs, every day, until the night has passed.
  const HOLIDAY = /\/parties\/(new-years-eve|new-years-day|thanksgiving-eve|christmas-eve|christmas)\/[a-z0-9-]+\/?$|\/nyc-nye-price-index\/?$|\/parties\/date\/\d{4}-(11-2[4-6]|12-2[45]|12-31|01-01)\/?$|-\d{4}-(11-25|12-24|12-31|01-01)\/?$/;
  const holiday = urls.filter((u) => !always.includes(u) && HOLIDAY.test(u));
  const order = (u) => (/\/parties\/|\/blog\//.test(u) ? 0 : 1);
  const rest = urls.filter((u) => !always.includes(u) && !holiday.includes(u)).sort((a, b) => order(a) - order(b));
  const n2 = Math.max(0, cap - always.length - holiday.length), start2 = rest.length ? (Math.floor(Date.now() / 864e5) * n2) % rest.length : 0;
  const batch = [...always, ...holiday, ...rest.slice(start2), ...rest.slice(0, start2)].slice(0, cap);
  console.log(`bing batch: ${always.length} hubs + ${Math.min(holiday.length, Math.max(0, cap - always.length))} holiday pages every day + ${Math.max(0, batch.length - always.length - holiday.length)} rotating from ${start2} of ${rest.length}`);
  if (batch.length) {
    const r = await fetch(api('SubmitUrlBatch'), { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteUrl: `${SITE}/`, urlList: batch }) });
    console.log(`bing url batch: ${batch.length} URLs, HTTP ${r.status}`);
  }
} else console.log('BING_API_KEY missing');
