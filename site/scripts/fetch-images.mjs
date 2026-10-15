/**
 * Runs before `astro build`. Downloads the approved photos (site_images view: freely
 * licensed Wikimedia Commons files, one per bar / venue / neighborhood) and serves them
 * from our own domain, so a page never hotlinks and a takedown is one DB call + rebuild.
 *
 * Writes WebP renditions made with sharp from the downloaded original (kept only in the cache):
 *   public/img/{kind}/{key}.webp      up to 1280px wide, for page heroes
 *   public/img/{kind}/{key}-m.webp    800px, for heroes on phones (srcset)
 *   public/img/{kind}/{key}-s.webp    500px, for cards
 *   src/data/images.json              what was downloaded, with author/license/source for credits
 *
 * A photo that fails to download is left out; the page falls back to its designed card.
 * YAY_FIXTURE=1 uses fixtures/images.json and the files already in public/img (none needed).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const SUPABASE_URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JxdYGXYsOzPNAC9avS8wfA_SExSJIHc';
const UA = 'YaYNYC-build/1.0 (https://yaynyc.com/image-credits)';
const root = process.cwd();
const outJson = join(root, 'src', 'data', 'images.json');
mkdirSync(join(root, 'src', 'data'), { recursive: true });

if (process.env.YAY_FIXTURE === '1') {
  const f = join(root, 'fixtures', 'images.json');
  writeFileSync(outJson, existsSync(f) ? readFileSync(f, 'utf-8') : '[]');
  console.log('images: fixture mode');
  process.exit(0);
}

let rows = [];
try {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_images?select=*`, { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  rows = await r.json();
} catch (e) {
  // no photos is a valid site; a broken build is not
  console.warn(`images: could not read site_images (${e.message}); building without photos`);
  writeFileSync(outJson, '[]');
  process.exit(0);
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const safe = (s) => s.replace(/[^a-z0-9-]/gi, '-');
/** Commons gives author links as "//commons...", "/wiki/User:X" or red edit links with &amp; */
function authorLink(u) {
  if (!u) return null;
  let s = u.replace(/&amp;/g, '&');
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('/')) s = `https://commons.wikimedia.org${s}`;
  const user = s.match(/[?&]title=(User:[^&#]+)/);
  if (user) s = `https://commons.wikimedia.org/wiki/${user[1]}`;
  return /^https?:\/\//.test(s) ? s : null;
}

// Cloudflare Workers Builds keeps node_modules/.astro between builds (build cache): originals and
// renditions are made once into it and copied into public/img on every build
const CACHE = join(root, 'node_modules', '.astro', 'yay-img');
const pub = (f) => join(root, 'public', 'img', f);
const cached = (f) => join(CACHE, f);
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };
/** the original, downloaded once into the cache (never served) */
async function original(url, rel) {
  const f = cached(`orig/${rel}`);
  if (existsSync(f)) return f;
  // builds before the WebP switch cached the 1280px original at <kind>/<file>
  if (existsSync(cached(rel))) { copy(cached(rel), f); return f; }
  mkdirSync(dirname(f), { recursive: true });
  return (await download(url, f)) ? f : null;
}
/** a WebP rendition `width` px wide (never upscaled), from the cache or made now */
async function rendition(orig, rel, width) {
  const out = pub(rel);
  if (existsSync(out)) return true;
  const c = cached(rel);
  if (!existsSync(c)) {
    try {
      mkdirSync(dirname(c), { recursive: true });
      await sharp(orig).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: width > 800 ? 72 : 70, effort: 4 }).toFile(c);
    } catch { return false; }
  }
  copy(c, out);
  return true;
}
const done = [];
const queue = [...rows];
async function worker() {
  for (let row; (row = queue.shift()); ) {
    mkdirSync(join(root, 'public', 'img', row.subject_kind), { recursive: true });
    const base = `${safe(row.subject_key)}-${createHash('sha1').update(row.thumb_url).digest('hex').slice(0, 8)}`;
    const ext = /\.png$/i.test(row.file_title) ? 'png' : /\.webp$/i.test(row.file_title) ? 'webp' : 'jpg';
    const orig = await original(row.thumb_url, `${row.subject_kind}/${base}.${ext}`);
    if (!orig) continue;
    const rel = (sfx) => `${row.subject_kind}/${base}${sfx}.webp`;
    if (!(await rendition(orig, rel(''), 1280))) continue;
    const mid = await rendition(orig, rel('-m'), 800);
    const sm = await rendition(orig, rel('-s'), 500);
    // page photos are also share images: a 1200x630 JPEG, which every social network reads
    let og = null;
    if (row.subject_kind === 'page') {
      const o = `page/${base}-og.jpg`;
      try {
        if (!existsSync(cached(o))) await sharp(orig).rotate().resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile(cached(o));
        copy(cached(o), pub(o)); og = `/img/${o}`;
      } catch { /* the share image falls back to the default */ }
    }
    const ratio = row.width && row.height ? row.width / row.height : 4 / 3;
    done.push({
      kind: row.subject_kind, key: row.subject_key,
      src: `/img/${rel('')}`, thumb: `/img/${rel(sm ? '-s' : '')}`, ...(mid ? { mid: `/img/${rel('-m')}` } : {}), ...(og ? { og } : {}),
      w: Math.min(row.width ?? 1280, 1280), h: Math.round(Math.min(row.width ?? 1280, 1280) / ratio),
      title: row.title, author: row.author, authorUrl: authorLink(row.author_url),
      license: row.license, licenseUrl: row.license_url, page: row.source_page, file: row.file_title,
      source: row.source ?? 'wikimedia_commons', match: row.match ?? undefined,
    });
  }
}
await Promise.all([worker(), worker(), worker()]);
done.sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key));
// a photo that left the list (license withdrawn, takedown, source we no longer use) must not stay
// on the site through a cached public/img: delete every file the list does not reference
const keep = new Set(done.flatMap((p) => [p.src, p.thumb, p.mid, p.og]));
let removed = 0;
for (const kind of ['bar', 'venue', 'hood', 'page']) {
  const dir = join(root, 'public', 'img', kind);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (!keep.has(`/img/${kind}/${f}`)) { rmSync(join(dir, f)); removed++; }
}
if (removed) console.log(`images: removed ${removed} files no longer listed`);
writeFileSync(outJson, JSON.stringify(done));
console.log(`images: ${done.length}/${rows.length} photos ready`);
