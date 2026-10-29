/**
 * The YaY NYC mark: the black Y on a taxi-yellow rounded square (the original logo, back on Oct 29, 2026).
 * One source for the header mark, the favicon and the app icons; scripts/brand-icons.mjs renders the
 * PNGs from it.
 */
export const YELLOW = '#FFD400';
export const INK = '#141414';
export const Y_PATH = 'M15 14h10l7 15 7-15h10L37 37v13H27V37z';

/** The mark as an SVG string. `square: false` drops the rounded corners (app icons are cropped by the OS). */
export function markSvg({ title = '', square = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>`
    + `<rect width="64" height="64" rx="${square ? 14 : 0}" fill="${YELLOW}"/><path d="${Y_PATH}" fill="${INK}"/></svg>`;
}
/** The Y alone inside a yellow square, scaled to `inset` (maskable icons keep the Y inside the safe zone). */
export function iconSvg(inset = 0.08) {
  const k = 1 - inset * 2, o = 32 - 32 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${YELLOW}"/>`
    + `<g transform="translate(${o} ${o}) scale(${k})"><path d="${Y_PATH}" fill="${INK}"/></g></svg>`;
}
