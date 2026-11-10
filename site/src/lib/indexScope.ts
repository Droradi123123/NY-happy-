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
/*
 * Two audiences (Nov 10, 2026). 77% of visits come from ChatGPT search, which lands on single party pages (about
 * 1,780 visits and 1,420 ticket clicks in 28 days), date pages and lists, and an assistant leaves out a page that
 * says "noindex". The 30-day window below was set for Google and hid 141 written-up nights from every engine,
 * most of New Year's Eve among them. So: every written-up night, every club with a night coming up, every list
 * and date page with 3 nights is indexable; Google alone keeps its narrower core (partyGoogle, venueGoogle,
 * PartyList.google, DatePage.google: <meta name="googlebot" content="noindex, follow"> and out of sitemap.xml).
 */
/** a party night: written up (our own copy) */
export const partyIndexable = (p: Party) => KEPT.has(`/parties/${p.slug}`) || !!p.copy?.about;
/** a club: at least one upcoming night */
export const venueIndexable = (id: string, upcoming: number) => KEPT.has(`/parties/venue/${id}`) || upcoming >= 1;
export const nearIndexable = (kind: string, slug = '') => kind === 'landmark' || KEPT.has(`/happy-hours/near/${slug}`);
/** the page already had Google impressions */
export const pathKept = (path: string) => KEPT.has(path);
export const keptNear = () => [...KEPT].filter((p) => p.startsWith('/happy-hours/near/')).map((p) => p.slice('/happy-hours/near/'.length));
/*
 * Google core (Nov 6, 2026, approved by the owner): Google indexes ~10% of a new domain's ~1,200 pages, the pattern
 * of a site it does not trust yet with many similar pages. Google alone is asked to skip the thinner ones
 * (<meta name="googlebot" content="noindex, follow">, and they leave sitemap.xml); Bing, IndexNow and ChatGPT
 * search, which bring most of the traffic, keep every indexable page (sitemap-full.xml). A page with Google
 * impressions or repeat visits (KEPT) stays in Google whatever the rule. Reversible: loosen these three.
 */
/** a bar Google sees: a strong deal (3+ priced items, read in 30 days) that also offers food, a weekend or late window, or a drink at $7 or less */
export const barGoogle = (b: Bar) => KEPT.has(`/bars/${b.slug}`) || (barIndexable(b) && b.offers.length >= 3 && (b.hasFood || b.weekend || b.late || (b.cheapestDrink ?? 99) <= 7));
/** a party night Google sees: written up and within the next 14 days */
export const partyGoogle = (p: Party) => KEPT.has(`/parties/${p.slug}`) || (!!p.copy?.about && Date.parse(`${p.night_date}T12:00:00Z`) <= Date.now() + 14 * 864e5);
/** a club Google sees: three or more upcoming nights */
export const venueGoogle = (id: string, upcoming: number) => KEPT.has(`/parties/venue/${id}`) || upcoming >= 3;
const FIXED = new Set(['/map', '/map/happy-hours', '/map/parties', '/image-credits', '/accessibility', '/bars-with-games']);
export const pathIndexable = (path: string) => !FIXED.has(path) && !path.startsWith('/bars-with-games/');
