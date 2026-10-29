/**
 * Renders the favicon and app icons from the yellow-Y mark (src/lib/brand.mjs).
 * Run by hand after changing the mark: node scripts/brand-icons.mjs. Outputs are committed in public/.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { markSvg, iconSvg } from '../src/lib/brand.mjs';

const pub = new URL('../public/', import.meta.url);
const out = (f) => new URL(f, pub).pathname;

// browser tab: the yellow rounded square with the black Y
fs.writeFileSync(out('favicon.svg'), markSvg() + '\n');
// app icons: full-bleed yellow (the OS rounds the corners); maskable keeps the Y inside the safe zone
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out(file));
await png(iconSvg(0.14), 180, 'apple-touch-icon.png');
await png(iconSvg(0.14), 192, 'icon-192.png');
await png(iconSvg(0.14), 512, 'icon-512.png');
await png(iconSvg(0.24), 512, 'icon-maskable-512.png');
await png(markSvg(), 48, 'favicon-48.png');

fs.writeFileSync(out('site.webmanifest'), JSON.stringify({
  name: 'YaY NYC', short_name: 'YaY NYC', description: 'NYC happy hours and parties. All the fun in one place!',
  start_url: '/', display: 'standalone', background_color: '#FFD400', theme_color: '#16122B',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
console.log('brand icons written');
