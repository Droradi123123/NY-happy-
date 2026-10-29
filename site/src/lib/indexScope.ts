/**
 * Which pages ask search engines to index them (Oct 27, 2026). Google began dropping pages site-wide
 * on Oct 25 (an index sample fell from 51 of 107 to 14 of 108 in two days, with no technical fault), so
 * only pages with something of their own stay in the index and the sitemaps. The rest are still built
 * and linked as before, with "noindex, follow". Reversible: loosen the rules here.
 * - a bar: only with a deal on file (prices, a discount or 2-for-1), not with times alone
 * - "happy hour near": landmarks only; the subway-station pages repeat the neighborhood lists
 * - maps, bars with games, image credits, accessibility: little text of their own
 * Oct 29: a page that already had Google impressions stays indexed whatever the rule says
 * (src/data/search-kept.json, and src/data/proof.json from the daily export): it ranks, so taking it
 * out of Google loses what it earned.
 */
import type { Bar } from './data';
import kept from '../data/search-kept.json';
import proof from '../data/proof.json';
// the Oct 29 list, plus every page the daily export (scripts/analytics-export.mjs) has seen in Google
const KEPT = new Set([...kept.paths, ...(proof.everInSearch ?? [])]);
export const barIndexable = (b: Bar) => b.dealKnown || KEPT.has(`/bars/${b.slug}`);
export const nearIndexable = (kind: string, slug = '') => kind === 'landmark' || KEPT.has(`/happy-hours/near/${slug}`);
export const keptNear = () => [...KEPT].filter((p) => p.startsWith('/happy-hours/near/')).map((p) => p.slice('/happy-hours/near/'.length));
const FIXED = new Set(['/map', '/map/happy-hours', '/map/parties', '/image-credits', '/accessibility', '/bars-with-games']);
export const pathIndexable = (path: string) => !FIXED.has(path) && !path.startsWith('/bars-with-games/');
