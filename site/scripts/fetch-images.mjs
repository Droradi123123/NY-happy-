/**
 * Runs before `astro build`. Downloads the approved photos (site_images view: freely
 * licensed Wikimedia Commons files, one per bar / venue / neighborhood) and serves them
 * from our own domain, so a page never hotlinks and a takedown is one DB call + rebuild.
 *
 * Writes:
 *   public/img/{kind}/{key}.{ext}     ~1280px, for page heroes
 *   public/img/{kind}/{key}-s.{ext}   ~500px, for cards
 *   src/data/images.json              what was downloaded, with author/license/source for credits
 *
 * A photo that fails to download is left out; the page falls back to its designed card.
 * YAY_FIXTURE=1 uses fixtures/images.json and the files already in public/img (none needed).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

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
const small = (u) => (/\/1280px-/.test(u) ? u.replace('/1280px-', '/500px-') : u);
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

// Cloudflare Workers Builds keeps node_modules/.astro between builds (build cache): photos are
// downloaded once into it and copied into public/img on every build
const CACHE = join(root, 'node_modules', '.astro', 'yay-img');
async function get(url, file) {
  // file names carry a hash of the source URL, so a changed photo never reuses an old file
  if (existsSync(file)) return true; // a second run
  const cached = join(CACHE, file.slice(join(root, 'public', 'img').length + 1));
  if (existsSync(cached)) { mkdirSync(dirname(cached), { recursive: true }); copyFileSync(cached, file); return true; }
  const ok = await download(url, file);
  if (ok) { mkdirSync(dirname(cached), { recursive: true }); copyFileSync(file, cached); }
  return ok;
}
async function download(url, file) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (i + 1))); continue; }
      if (!r.ok) return false;
      const type = (r.headers.get('content-type') ?? '').split(';')[0];
      if (!EXT[type]) return false;
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch { /* retry */ }
  }
  return false;
}

const done = [];
const queue = [...rows];
async function worker() {
  for (let row; (row = queue.shift()); ) {
    const ext = /\.png$/i.test(row.file_title) ? 'png' : /\.webp$/i.test(row.file_title) ? 'webp' : 'jpg';
    const dir = join(root, 'public', 'img', row.subject_kind);
    mkdirSync(dir, { recursive: true });
    const base = `${safe(row.subject_key)}-${createHash('sha1').update(row.thumb_url).digest('hex').slice(0, 8)}`;
    const big = await get(row.thumb_url, join(dir, `${base}.${ext}`));
    // only Commons serves a smaller rendition; a Google photo is used at one size
    const sm = big && small(row.thumb_url) !== row.thumb_url && (await get(small(row.thumb_url), join(dir, `${base}-s.${ext}`)));
    if (!big) continue;
    const ratio = row.width && row.height ? row.width / row.height : 4 / 3;
    done.push({
      kind: row.subject_kind, key: row.subject_key,
      src: `/img/${row.subject_kind}/${base}.${ext}`, thumb: `/img/${row.subject_kind}/${base}${sm ? '-s' : ''}.${ext}`,
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
const keep = new Set(done.flatMap((p) => [p.src, p.thumb]));
let removed = 0;
for (const kind of ['bar', 'venue', 'hood']) {
  const dir = join(root, 'public', 'img', kind);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (!keep.has(`/img/${kind}/${f}`)) { rmSync(join(dir, f)); removed++; }
}
if (removed) console.log(`images: removed ${removed} files no longer listed`);
writeFileSync(outJson, JSON.stringify(done));
console.log(`images: ${done.length}/${rows.length} photos ready`);
