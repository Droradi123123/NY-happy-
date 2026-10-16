#!/usr/bin/env node
/**
 * QA only: compare a baseline build with a modified build made from the same data snapshot and clock
 * (scripts/qa/snapshot-preload.mjs). Every existing page is checked for its URL, canonical, title,
 * description, robots, h1, JSON-LD and main text; differences are classified:
 *   approved   a change on the approved list (removed by the normalizers below, then compared again)
 *   regression anything left over
 *   new        pages only in the modified build
 *
 *   node scripts/qa/compare-builds.mjs <baseline dist> <modified dist> [report.json]
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [A, B, OUT] = process.argv.slice(2);
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const pages = (d) => new Set(walk(d).filter((f) => f.endsWith('.html')).map((f) => relative(d, f)));
const pa = pages(A), pb = pages(B);

// ---- approved changes: each normalizer removes exactly one approved difference ----
const APPROVED = [
  ['menu: "Trivia and games" group', (h) => h.replace(/<section[^>]*>\s*<h2[^>]*>Trivia and games<\/h2>[\s\S]*?<\/section>\s*/, '')],
  ['footer: trivia and games links', (h) => h.replace(/<li[^>]*>\s*<a[^>]*href="\/trivia"[^>]*>Trivia nights<\/a>\s*<\/li>\s*<li[^>]*>\s*<a[^>]*href="\/bars-with-games"[^>]*>Bars with games<\/a>\s*<\/li>\s*/, '')],
  ['bar / club page: trivia and games block', (h) => h.replace(/<section class="section"[^>]*id="trivia-games"[^>]*>[\s\S]*?<\/section>\s*/, ' ')],
  ['bar page: "Today" badge computed in the browser', (h) => h.replace(/<span class="chip badge-live today"[^>]*>Today<\/span>/g, '').replace(/<script[^>]*>[^<]*data-today[\s\S]*?<\/script>/, '')],
  ['bar page: deal date wording (confirmed only after a matching re-read)', (h) => h
    .replace(/<p class="checked-line"[^>]*>(?:Deal last confirmed [^<]* on |Deal as published on )([\s\S]*?)(?:, read [^<.]*)?\. Deals change[^<]*<\/p>/, '<p class="checked-line">DEAL-LINE $1</p>')
    .replace(/(?:Checked against|Confirmed on|As published on) ([^"]*?)(?:,)? (?:on |read )([A-Z][a-z]{2} \d{1,2}, \d{4})\./g, 'DEAL-FAQ $1 $2.')],
];
const BUILD_NOISE = (h) => h
  .replace(/\/_astro\/[^"' )]+/g, '/_astro/X')
  .replace(/ data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '')
  .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/g, '');

const pick = (h) => ({
  canonical: h.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null,
  title: h.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
  description: h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null,
  robots: h.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? 'index',
  h1: (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, ''),
  jsonld: [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n'),
  body: h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''),
});

const report = { pages_baseline: pa.size, pages_modified: pb.size, missing: [], new: [...pb].filter((p) => !pa.has(p)).sort(), approved: {}, regressions: [] };
for (const p of [...pa].sort()) {
  if (!pb.has(p)) { report.missing.push(p); continue; }
  const ha = BUILD_NOISE(readFileSync(join(A, p), 'utf-8'));
  let hb = BUILD_NOISE(readFileSync(join(B, p), 'utf-8'));
  let hA = ha;
  if (ha === hb) continue;
  for (const [name, fn] of APPROVED) {
    const nb = fn(hb), na = fn(hA);
    if (nb !== hb || na !== hA) { (report.approved[name] ??= []).push(p); hb = nb; hA = na; }
  }
  // whitespace between tags is not content (an empty conditional block leaves a space)
  hA = hA.replace(/\s+/g, ' '); hb = hb.replace(/\s+/g, ' ');
  if (hA === hb) continue;
  const a = pick(hA), b = pick(hb);
  const fields = Object.keys(a).filter((k) => a[k] !== b[k]);
  // the first differing stretch, for a human to read
  let i = 0; while (i < hA.length && hA[i] === hb[i]) i++;
  report.regressions.push({ page: p, fields, at: i, baseline: hA.slice(Math.max(0, i - 120), i + 200), modified: hb.slice(Math.max(0, i - 120), i + 200) });
}
for (const k of Object.keys(report.approved)) report.approved[k] = { count: report.approved[k].length, sample: report.approved[k].slice(0, 5) };

// sitemap and other non-page outputs
const sm = (d) => new Map([...readFileSync(join(d, 'sitemap.xml'), 'utf-8').matchAll(/<loc>([^<]*)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?/g)].map((m) => [m[1], m[2] ?? null]));
const sa = sm(A), sb = sm(B);
report.sitemap = {
  added: [...sb.keys()].filter((u) => !sa.has(u)),
  removed: [...sa.keys()].filter((u) => !sb.has(u)),
  lastmod_changed: [...sa.keys()].filter((u) => sb.has(u) && sa.get(u) !== sb.get(u)).map((u) => [u, sa.get(u), sb.get(u)]),
};
report.other_files = {};
for (const f of ['robots.txt', 'llms.txt', 'data/bars.json', 'data/parties.json', '_redirects', '_headers']) {
  const fa = join(A, f), fb = join(B, f);
  report.other_files[f] = !existsSync(fa) && !existsSync(fb) ? 'absent in both' : existsSync(fa) && existsSync(fb) && readFileSync(fa, 'utf-8') === readFileSync(fb, 'utf-8') ? 'identical' : 'DIFFERENT';
}
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, regressions: report.regressions.slice(0, 5) }, null, 1).slice(0, 6000));
console.log(`\n${report.regressions.length} unexplained difference(s), ${report.missing.length} missing page(s), ${report.new.length} new page(s)`);
process.exit(report.regressions.length || report.missing.length ? 1 : 0);
