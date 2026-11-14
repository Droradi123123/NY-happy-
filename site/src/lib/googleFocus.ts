/**
 * Google focus (Nov 14, 2026, approved by the owner). Search Console: Google showed the site ~1,000 times a day
 * from Oct 16 to Oct 24, then ~3 a day from Oct 25 on, and has barely crawled since (an index sample: 11 of 115
 * pages indexed, most last crawled Oct 15-20). It rates a new domain on the average page it sees, and it saw
 * ~1,150 mostly templated pages with no links in. So Google alone is now shown a short list: every page that
 * already earned Google impressions (it keeps what it earned), the hubs and data pages, the holiday lists Google
 * is asked for, and the best-known attractions. Every other page stays indexable for Bing, IndexNow and ChatGPT
 * search (sitemap-full.xml) and gets <meta name="googlebot" content="noindex, follow">. Reversible: widen CORE or
 * ATTRACTIONS, or return true.
 */
import kept from '../data/search-kept.json';
import proof from '../data/proof.json';
import { partyLists } from './partyLists';
import { attractions, attractionCategories } from './attractions';

/** pages Google has shown at least once (the Oct 29 list and the daily export), not pages only visited from ChatGPT */
const IN_GOOGLE = new Set<string>([...kept.paths, ...((proof as { everInSearch?: string[] }).everInSearch ?? [])]);

const CORE = [
  '/', '/happy-hours', '/parties', '/attractions', '/blog', '/trivia', '/press', '/about', '/editorial-policy',
  '/nyc-happy-hour-index', '/nyc-nye-price-index', '/happy-hours/neighborhoods', '/happy-hours/now',
  '/happy-hours/manhattan', '/happy-hours/brooklyn', '/happy-hours/queens', '/happy-hours/cheap-drinks', '/happy-hours/rooftop',
  '/parties/calendar', '/parties/tonight', '/parties/this-weekend', '/parties/halloween', '/parties/new-years-eve', '/parties/thanksgiving-eve',
];
/** the attractions people search for by name */
const ATTRACTIONS = ['statue-of-liberty', 'ellis-island', 'empire-state-building', 'top-of-the-rock', 'edge', 'summit-one-vanderbilt',
  'one-world-observatory', 'met-museum', 'moma', 'guggenheim', 'amnh', 'nine-eleven-museum', 'intrepid', 'central-park', 'high-line',
  'little-island', 'bryant-park', 'brooklyn-bridge-park', 'grand-central', 'met-cloisters', 'whitney', 'museum-of-ice-cream', 'bronx-zoo',
  'wollman-rink', 'rink-at-rockefeller-center', 'staten-island-ferry', 'vessel', 'oculus', 'chelsea-market', 'radio-city', 'carnegie-hall',
  'morgan', 'frick', 'brooklyn-museum', 'nybg', 'bbg', 'spyscape', 'museum-of-illusions', 'museum-of-sex', 'riseny'];

let focus: Promise<Set<string>> | null = null;
export function googleFocus(): Promise<Set<string>> {
  focus ??= (async () => {
    const s = new Set<string>([...IN_GOOGLE, ...CORE]);
    // the holiday hubs and their slices that clear Google's bar (PartyList.google)
    for (const l of await partyLists()) if (l.kind === 'holiday' && l.google) s.add(`/parties/${l.slug}`);
    const live = new Set(attractions().map((a) => a.id));
    for (const id of ATTRACTIONS) if (live.has(id)) s.add(`/attractions/${id}`);
    for (const c of attractionCategories()) s.add(`/attractions/${c.slug}`);
    return s;
  })();
  return focus;
}
/** Google is asked to index this path */
export const inGoogleFocus = async (path: string) => (await googleFocus()).has(path);
