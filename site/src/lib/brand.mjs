/**
 * The YaY NYC apple: a coral-to-violet Big Apple whose left side breaks into disco-ball tiles
 * (the city grid, the dance floor). One source for the header mark, the favicon and the app icons;
 * scripts/brand-icons.mjs renders the PNGs from it.
 */
export const APPLE = 'M32 19.5C27.5 15.5 13.5 14.8 10.6 26.6 8 37.4 14.6 52.4 22.2 55.4 26 56.9 28.4 54.9 32 54.9 35.6 54.9 38 56.9 41.8 55.4 49.4 52.4 56 37.4 53.4 26.6 50.5 14.8 36.5 15.5 32 19.5Z';
export const STEM = 'M32.4 19.6C32.2 15.6 33.2 11.6 35.6 8.4';
export const LEAF = 'M35.2 13.8C36.4 8.2 41.6 5.6 47.6 6.4 46.6 12 41.2 15 35.2 13.8Z';
export const SHINE = 'M44.5 25.5c2.6 1.4 4.2 4 4.6 7';

// tile columns [x, width, opacity]: narrower toward the edge like a sphere, fading toward the middle
const COLS = [[8.4, 3.4, 0.8], [12.6, 4.2, 0.7], [17.6, 4.7, 0.55], [23.1, 5, 0.36], [28.9, 5, 0.18]];
export const TILES = COLS.flatMap(([x, w, o]) => {
  const out = [];
  for (let y = 16.2; y < 58; y += 5.6) {
    const k = ((x * 7 + y * 3) | 0) % 5;
    const op = Math.max(0, o - (k === 0 ? 0.3 : k === 3 ? 0.12 : 0));
    if (op > 0.05) out.push({ x, y: +y.toFixed(1), w, op: +op.toFixed(2) });
  }
  return out;
});

/** The mark as an SVG string. `id` keeps gradient ids unique when several marks share a page. */
export function markSvg({ id = 'yay', stem = '#16122B', bg = '', darkStem = '', title = '' } = {}) {
  const tiles = TILES.map((t) => `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="4.6" rx="1.1" fill="#FFE3E8" fill-opacity="${t.op}"/>`).join('');
  const dark = darkStem ? `<style>@media (prefers-color-scheme: dark){.st{stroke:${darkStem}}}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>${dark}`
    + (bg ? `<rect width="64" height="64" fill="${bg}"/>` : '')
    + `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4F64"/><stop offset=".55" stop-color="#C2307F"/><stop offset="1" stop-color="#5B2EE8"/></linearGradient>`
    + `<clipPath id="${id}-c"><path d="${APPLE}"/></clipPath></defs>`
    + `<path class="st" d="${STEM}" fill="none" stroke="${stem}" stroke-width="2.6" stroke-linecap="round"/>`
    + `<path d="${LEAF}" fill="#5B2EE8"/><path d="${APPLE}" fill="url(#${id}-g)"/>`
    + `<g clip-path="url(#${id}-c)">${tiles}</g>`
    + `<path d="${SHINE}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}
