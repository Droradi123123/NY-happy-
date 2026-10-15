/**
 * Renders the favicon, app icons and the default share image from the apple mark (src/lib/brand.mjs).
 * Run by hand after changing the mark: node scripts/brand-icons.mjs. Outputs are committed in public/.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { markSvg } from '../src/lib/brand.mjs';

const pub = new URL('../public/', import.meta.url);
const out = (f) => new URL(f, pub).pathname;

// browser tab: transparent, stem turns white on dark tab strips
fs.writeFileSync(out('favicon.svg'), markSvg({ id: 'f', darkStem: '#FFFFFF' }) + '\n');

// app icons sit on the night-ink square; the mark is inset so maskable crops keep the whole apple
const onInk = (inset) => {
  const s = 64 / (1 - inset * 2);
  const o = (s - 64) / 2;
  return Buffer.from(markSvg({ id: 'a', stem: '#FFFFFF' }).replace('viewBox="0 0 64 64"', `viewBox="${-o} ${-o} ${s} ${s}"`)
    .replace('<defs>', `<rect x="${-o}" y="${-o}" width="${s}" height="${s}" fill="#16122B"/><defs>`));
};
const png = (svg, size, file) => sharp(svg, { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out(file));
await png(onInk(0.08), 180, 'apple-touch-icon.png');
await png(onInk(0.08), 192, 'icon-192.png');
await png(onInk(0.08), 512, 'icon-512.png');
await png(onInk(0.18), 512, 'icon-maskable-512.png');
await png(Buffer.from(markSvg({ id: 'p' })), 48, 'favicon-48.png');

fs.writeFileSync(out('site.webmanifest'), JSON.stringify({
  name: 'YaY NYC', short_name: 'YaY NYC', description: 'NYC happy hours and parties. All the fun in one place!',
  start_url: '/', display: 'standalone', background_color: '#16122B', theme_color: '#16122B',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
console.log('brand icons written');
