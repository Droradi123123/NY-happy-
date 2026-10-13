#!/usr/bin/env node
/**
 * The deploy gate. Fails the build (and so the deploy) when:
 *  1. anything from HappyTLV or fami-ly leaks into the output (separate brands, analytics, databases)
 *  2. a page lacks exactly one h1, a title, a description or a canonical
 *  3. "undefined", "null" or "NaN" reaches visible text or a meta tag
 *  4. an internal link points at a page that was not built
 *  5. an image has no alt text
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
const uniq = [...new Set(fail)];
if (uniq.length) {
  console.error(`✗ verify-build: ${uniq.length} problem(s)\n` + uniq.slice(0, 60).map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
console.log(`✓ verify-build: ${pages.length} pages, no isolation leaks, no broken internal links`);
