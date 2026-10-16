#!/usr/bin/env node
/**
 * The deploy gate. Fails the build (and so the deploy) when:
 *  1. anything from HappyTLV or fami-ly leaks into the output (separate brands, analytics, databases)
 *  2. a page lacks exactly one h1, a title, a description or a canonical
 *  3. "undefined", "null" or "NaN" reaches visible text or a meta tag
 *  4. an internal link points at a page that was not built
 *  5. an image has no alt text
 *  6. trivia / games: src/data/activities.json holds anything but reviewed public rows (a held field, an
 *     address-less venue, an unsourced night, "weekly" without a source saying so, a pinball-map-only lead),
 *     or internal markers (quarantine, noaddr, held_because, pinball-map leads) reach the built site
 *  7. SEO: an indexable page has no target keyword, or its keyword is missing from the title,
 *     the h1 or the meta description; two pages share a keyword, a title or a description
 *     (they would compete for the same search); a description is shorter than 70 or
 *     longer than 160 characters
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const FORBIDDEN = ['happytlv', 'G-N6T36Y0ZJ8', 'ophzyckyiwsjhrkvmxlk', 'haxerrdwhndcbpetxsiu', 'a3afi93f09', 'fami-ly'];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(DIST);
const fail = [];

for (const f of files.filter((f) => /\.(html|js|json|txt|xml|css)$/.test(f))) {
  const s = readFileSync(f, 'utf-8').toLowerCase();
  for (const bad of FORBIDDEN) if (s.includes(bad.toLowerCase())) fail.push(`${relative(DIST, f)}: contains "${bad}" (isolation from HappyTLV)`);
}
const built = (p) => {
  const clean = decodeURIComponent(p.split(/[?#]/)[0]).replace(/\/$/, '');
  if (clean === '') return existsSync(join(DIST, 'index.html'));
  return [`${clean}.html`, `${clean}/index.html`, clean].some((c) => existsSync(join(DIST, c.replace(/^\//, ''))));
};
const pages = files.filter((f) => f.endsWith('.html'));
for (const f of pages) {
  const rel = relative(DIST, f);
  const html = readFileSync(f, 'utf-8');
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail.push(`${rel}: ${h1} h1 elements`);
  if (!/<title>[^<]{8,}<\/title>/.test(html)) fail.push(`${rel}: missing title`);
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) fail.push(`${rel}: missing or short description`);
  if (!/<link rel="canonical"/.test(html)) fail.push(`${rel}: no canonical`);
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const m = text.match(/>[^<]*\b(undefined|NaN|null)\b[^<]*</) ?? text.match(/content="[^"]*\b(undefined|NaN|null)\b[^"]*"/);
  if (m) fail.push(`${rel}: "${m[1]}" in output: ${m[0].slice(0, 80)}`);
  for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)) if (!href.startsWith('/data/') && !built(href)) fail.push(`${rel}: broken link ${href}`);
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(img)) fail.push(`${rel}: image without alt`);
}
// ---------- trivia, music bingo, games: only reviewed public records ----------
{
  const actFile = new URL('../src/data/activities.json', import.meta.url).pathname;
  if (existsSync(actFile)) {
    const raw = readFileSync(actFile, 'utf-8');
    const act = JSON.parse(raw);
    for (const bad of ['held_because', 'wb_evidence', 'quarantine', 'pinball_only', '"publish": false']) if (raw.includes(bad)) fail.push(`activities.json: contains "${bad}" (internal data)`);
    for (const [k, v] of Object.entries(act.venues)) {
      if (k.endsWith('--noaddr') || !v.address || !v.borough) fail.push(`activities.json: venue ${k} has no verified address`);
      if (!['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].includes(v.borough)) fail.push(`activities.json: venue ${k} is outside the five boroughs (${v.borough})`);
    }
    for (const t of act.trivia) {
      if (!act.venues[t.v]) fail.push(`activities.json: ${t.key} has no venue`);
      if (!t.sources?.length) fail.push(`activities.json: ${t.key} has no source`);
      if (/weekly|every week/i.test(t.rec) && t.recKind !== 'weekly_stated' && !/every other week/i.test(t.rec)) fail.push(`activities.json: ${t.key} says "${t.rec}" without a source stating it`);
      if (t.prize && !t.prizeSource) fail.push(`activities.json: ${t.key} prize without a source`);
    }
    for (const g of act.games) {
      if (!g.sources?.some((x) => x.type !== 'crowdsourced')) fail.push(`activities.json: game ${g.key} rests on a crowdsourced map only`);
      if ((g.hours || g.cost) && !g.sources.some((x) => x.type === 'official')) fail.push(`activities.json: game ${g.key} shows hours or prices without an official source`);
    }
  }
  for (const f of files.filter((f) => /\.(html|json|xml|txt)$/.test(f))) {
    const t = readFileSync(f, 'utf-8');
    for (const bad of ['--noaddr', 'held_because', 'pinballnyc.com', 'Pinball NYC locator', 'quarantine']) if (t.includes(bad)) fail.push(`${relative(DIST, f)}: contains "${bad}" (internal trivia/games data)`);
  }
}

// ---------- SEO ----------
const decode = (t) => t.replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const words = (t) => new Set(decode(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9$]+/).filter(Boolean));
const STOP = new Set(['in', 'at', 'the', 'a', 'an', 'of', 'and', 'for', 'on', 'to', 'by', 'with']);
const has = (set, w) => set.has(w) || set.has(`${w}s`) || set.has(w.replace(/s$/, '')) || set.has(w.replace(/es$/, '')) || set.has(w.replace(/ies$/, 'y')) || set.has(w.replace(/y$/, 'ies'));
const seen = { kw: new Map(), title: new Map(), desc: new Map() };
const warn = [];
for (const f of pages) {
  const rel = relative(DIST, f);
  const html = readFileSync(f, 'utf-8');
  if (/<meta name="robots" content="noindex/.test(html)) continue;
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  const h1 = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, ' '));
  const kw = decode(html.match(/<html[^>]*data-kw="([^"]*)"/)?.[1] ?? '');
  if (!kw) { fail.push(`${rel}: no target keyword`); continue; }
  const need = [...words(kw)].filter((w) => !STOP.has(w));
  for (const [where, text] of [['title', title], ['h1', h1], ['description', desc]]) {
    const got = words(text);
    const miss = need.filter((w) => !has(got, w));
    if (miss.length) fail.push(`${rel}: keyword "${kw}" not in ${where} (missing: ${miss.join(', ')})`);
  }
  if (desc.length < 70 || desc.length > 160) fail.push(`${rel}: description is ${desc.length} characters (70-160)`);
  if (title.length > 70) warn.push(`${rel}: title ${title.length} characters`);
  for (const [k, v] of [['kw', kw.toLowerCase()], ['title', title], ['desc', desc]]) {
    if (seen[k].has(v)) fail.push(`${rel}: same ${k === 'kw' ? 'keyword' : k === 'desc' ? 'description' : 'title'} as ${seen[k].get(v)}: "${v.slice(0, 70)}"`);
    else seen[k].set(v, rel);
  }
}
// sitemap <-> pages: no "Submitted URL not found / marked noindex", no indexable page left out
const sm = existsSync(join(DIST, 'sitemap.xml')) ? readFileSync(join(DIST, 'sitemap.xml'), 'utf-8') : '';
const inMap = new Set([...sm.matchAll(/<loc>https:\/\/yaynyc\.com([^<]*)<\/loc>/g)].map(([, u]) => u || '/'));
if (!inMap.size) fail.push('sitemap.xml: missing or empty');
for (const u of inMap) {
  if (!built(u)) { fail.push(`sitemap.xml: ${u} is not a built page`); continue; }
  const f = u === '/' ? join(DIST, 'index.html') : join(DIST, `${u.slice(1)}.html`);
  if (existsSync(f) && /<meta name="robots" content="noindex/.test(readFileSync(f, 'utf-8'))) fail.push(`sitemap.xml: ${u} is noindex`);
}
for (const f of pages) {
  const html = readFileSync(f, 'utf-8');
  if (/<meta name="robots" content="noindex/.test(html)) continue;
  const u = '/' + relative(DIST, f).replace(/\.html$/, '').replace(/^index$/, '');
  if (!inMap.has(u)) fail.push(`sitemap.xml: indexable page ${u} is missing`);
}
if (warn.length) console.warn(`! ${warn.length} title(s) over 70 characters (Google cuts them; allowed for long names), e.g. ${warn[0]}`);

const uniq = [...new Set(fail)];
if (uniq.length) {
  console.error(`✗ verify-build: ${uniq.length} problem(s)\n` + uniq.slice(0, 60).map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
console.log(`✓ verify-build: ${pages.length} pages, ${inMap.size} in the sitemap, ${seen.kw.size} target keywords (one per page, each in title + h1 + description), no isolation leaks, no broken internal links`);
