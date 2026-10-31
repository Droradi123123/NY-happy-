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
import type { Bar, Party } from './data';
import kept from '../data/search-kept.json';
import proof from '../data/proof.json';
// the Oct 29 list, plus every page the daily export (scripts/analytics-export.mjs) has seen in Google, plus
// (Oct 31) every page people opened twice or more in the last 28 days: 76% of visits come from ChatGPT,
// whose search leans on Bing's index, so a page people land on stays indexable wherever they came from
const VISITED = Object.entries((proof as { pages?: Record<string, { views28?: number }> }).pages ?? {}).filter(([, v]) => (v.views28 ?? 0) >= 2).map(([p]) => p);
const KEPT = new Set([...kept.paths, ...(proof.everInSearch ?? []), ...VISITED]);
/*
 * Index focus (Oct 31, 2026, approved by the owner): Google indexed 9 of a 121-page sample (index check,
 * Oct 31); it rates the whole site on the pages it sees, so a page without impressions or visits stays
 * indexable only when it has something of its own. The rest are built and linked as before, "noindex, follow".
 */
const fresh = (iso: string | null | undefined, days: number) => !!iso && Date.parse(iso) >= Date.now() - days * 864e5;
/** a bar: a priced deal of two or more items, read on its own site in the last 30 days, not contradicted by a
 * re-check, at a known address */
export const barIndexable = (b: Bar) => KEPT.has(`/bars/${b.slug}`) || (b.dealKnown && !b.doubt && b.cheapestDrink !== null && b.offers.length >= 2 && !!b.address && fresh(b.checked, 30));
/** a party night: written up (our own copy) and within the next 30 days */
export const partyIndexable = (p: Party) => KEPT.has(`/parties/${p.slug}`) || (!!p.copy?.about && Date.parse(`${p.night_date}T12:00:00Z`) <= Date.now() + 30 * 864e5);
/** a club: at least two upcoming nights */
export const venueIndexable = (id: string, upcoming: number) => KEPT.has(`/parties/venue/${id}`) || upcoming >= 2;
export const nearIndexable = (kind: string, slug = '') => kind === 'landmark' || KEPT.has(`/happy-hours/near/${slug}`);
/** the page already had Google impressions */
export const pathKept = (path: string) => KEPT.has(path);
export const keptNear = () => [...KEPT].filter((p) => p.startsWith('/happy-hours/near/')).map((p) => p.slice('/happy-hours/near/'.length));
const FIXED = new Set(['/map', '/map/happy-hours', '/map/parties', '/image-credits', '/accessibility', '/bars-with-games']);
export const pathIndexable = (path: string) => !FIXED.has(path) && !path.startsWith('/bars-with-games/');
