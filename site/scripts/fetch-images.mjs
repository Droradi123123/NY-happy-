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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

async function get(url, file) {
  if (existsSync(file)) return true; // Cloudflare build cache, or a second run
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
    const base = safe(row.subject_key);
    const big = await get(row.thumb_url, join(dir, `${base}.${ext}`));
    const sm = big && (await get(small(row.thumb_url), join(dir, `${base}-s.${ext}`)));
    if (!big) continue;
    const ratio = row.width && row.height ? row.width / row.height : 4 / 3;
    done.push({
      kind: row.subject_kind, key: row.subject_key,
      src: `/img/${row.subject_kind}/${base}.${ext}`, thumb: `/img/${row.subject_kind}/${base}${sm ? '-s' : ''}.${ext}`,
      w: Math.min(row.width ?? 1280, 1280), h: Math.round(Math.min(row.width ?? 1280, 1280) / ratio),
      title: row.title, author: row.author, authorUrl: row.author_url,
      license: row.license, licenseUrl: row.license_url, page: row.source_page, file: row.file_title,
    });
  }
}
await Promise.all([worker(), worker(), worker()]);
done.sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key));
writeFileSync(outJson, JSON.stringify(done));
console.log(`images: ${done.length}/${rows.length} photos ready`);
