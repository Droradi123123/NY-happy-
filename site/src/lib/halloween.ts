/**
 * Halloween sub-pages under /parties/halloween/<slug>: one per night, borough and kind of party.
 * Each targets its own search phrase and is built from the live party data at build time, so every
 * count, price and age rule on it comes from the parties it lists. A page with fewer than MIN
 * upcoming parties is built noindexed and left out of the sitemap (it never 404s once indexed).
 */
import { partyData, venueOf, type Party, type Venue } from './data';
import { partyTags } from './index';

export const HW_YEAR = 2026;
const MIN = 3;
const RAVE = new Set(['techno', 'edm', 'drum-and-bass', 'trance', 'hard-techno', 'dubstep']);

export interface HwPage {
  slug: string; short: string; h1: string; title: (n: number) => string; keyword: string;
  description: (n: number) => string; lead: string; test: (p: Party, v: Venue | null) => boolean;
}

const text = (p: Party, v: Venue | null) => `${p.title} ${p.copy?.about ?? ''} ${p.copy?.expect ?? ''} ${v?.name ?? ''}`;

export const HW_PAGES: HwPage[] = [
  {
    slug: 'october-31', short: 'Sat Oct 31', keyword: 'halloween parties nyc october 31',
    h1: `Halloween Night Parties in NYC: Saturday, October 31, ${HW_YEAR}`,
    title: (n) => `Halloween Parties NYC October 31, ${HW_YEAR}: ${n} on Halloween Night`,
    description: (n) => `Halloween parties in NYC on October 31, ${HW_YEAR}: ${n} Saturday-night parties with doors, age, price and tickets, checked against each ticket page.`,
    lead: 'Halloween falls on a Saturday this year.',
    test: (p) => p.night_date === `${HW_YEAR}-10-31`,
  },
  {
    slug: 'october-30', short: 'Fri Oct 30', keyword: 'halloween parties nyc friday october 30',
    h1: `Halloween Parties in NYC on Friday, October 30, ${HW_YEAR}`,
    title: (n) => `Halloween Parties NYC Friday, October 30: ${n} Parties`,
    description: (n) => `Halloween parties in NYC on Friday, October 30, ${HW_YEAR}: ${n} parties the night before Halloween, with doors, age, price and tickets.`,
    lead: 'Friday, October 30 is the night before Halloween, the first night of the Halloween weekend.',
    test: (p) => p.night_date === `${HW_YEAR}-10-30`,
  },
  {
    slug: 'brooklyn', short: 'Brooklyn', keyword: 'halloween parties brooklyn',
    h1: `Halloween Parties in Brooklyn ${HW_YEAR}`,
    title: (n) => `Halloween Parties Brooklyn ${HW_YEAR}: ${n} Parties, Night by Night`,
    description: (n) => `Halloween parties in Brooklyn for ${HW_YEAR}: ${n} parties night by night, with neighborhoods, doors, age, price and tickets for each.`,
    lead: 'Halloween parties in Brooklyn.',
    test: (p) => p.borough === 'Brooklyn',
  },
  {
    slug: 'manhattan', short: 'Manhattan', keyword: 'halloween parties manhattan',
    h1: `Halloween Parties in Manhattan ${HW_YEAR}`,
    title: (n) => `Halloween Parties Manhattan ${HW_YEAR}: ${n} Parties by Night`,
    description: (n) => `Halloween parties in Manhattan for ${HW_YEAR}: ${n} parties night by night, with neighborhoods, doors, age, price and tickets for each.`,
    lead: 'Halloween parties in Manhattan.',
    test: (p) => p.borough === 'Manhattan',
  },
  {
    slug: 'queens', short: 'Queens', keyword: 'halloween parties queens',
    h1: `Halloween Parties in Queens ${HW_YEAR}`,
    title: (n) => `Halloween Parties Queens ${HW_YEAR}: ${n} Parties`,
    description: (n) => `Halloween parties in Queens for ${HW_YEAR}: ${n} parties with doors, age, price and tickets, checked against each ticket page.`,
    lead: 'Halloween parties in Queens.',
    test: (p) => p.borough === 'Queens',
  },
  {
    slug: 'rooftop', short: 'Rooftop', keyword: 'rooftop halloween party nyc',
    h1: `Rooftop Halloween Parties in NYC ${HW_YEAR}`,
    title: (n) => `Rooftop Halloween Party NYC ${HW_YEAR}: ${n} Parties`,
    description: (n) => `Rooftop Halloween parties in NYC for ${HW_YEAR}: ${n} parties at rooftop bars and venues, with doors, age, price and tickets for each.`,
    lead: 'These are the Halloween parties whose venue or listing names a rooftop. In late October, check whether the space is heated or enclosed before you go.',
    test: (p, v) => partyTags(p, v).includes('rooftop'),
  },
  {
    slug: 'costume-contest', short: 'Costume contests', keyword: 'halloween costume contest nyc',
    h1: `Halloween Costume Contests in NYC ${HW_YEAR}`,
    title: (n) => `Halloween Costume Contest NYC ${HW_YEAR}: ${n} Parties With One`,
    description: (n) => `Halloween costume contests in NYC for ${HW_YEAR}: ${n} parties whose listing mentions a costume contest, with dates, doors, age and tickets.`,
    lead: 'Every party here mentions a costume contest in its listing. Prizes and judging rules are the promoter’s: check the party page for what the listing says.',
    test: (p, v) => /costume contest/i.test(text(p, v)),
  },
  {
    slug: 'lgbtq', short: 'LGBTQ+', keyword: 'lgbtq halloween parties nyc',
    h1: `Queer and LGBTQ+ Halloween Parties in NYC ${HW_YEAR}`,
    title: (n) => `LGBTQ+ Halloween Parties NYC ${HW_YEAR}: ${n} Queer Nights`,
    description: (n) => `Queer and LGBTQ+ Halloween parties in NYC for ${HW_YEAR}: ${n} nights, from drag to dance parties, with doors, age, price and tickets.`,
    lead: 'These Halloween nights describe themselves as queer, LGBTQ+ or drag in their own listing.',
    test: (p, v) => partyTags(p, v).includes('lgbtq'),
  },
  {
    slug: 'boat', short: 'Boat parties', keyword: 'halloween boat party nyc',
    h1: `Halloween Boat Parties in NYC ${HW_YEAR}`,
    title: (n) => `Halloween Boat Party NYC ${HW_YEAR}: ${n} Cruises`,
    description: (n) => `Halloween boat parties in NYC for ${HW_YEAR}: ${n} yacht and boat cruises with boarding times, age, price and tickets.`,
    lead: 'Boats leave on schedule: be at the pier by the boarding time on each page.',
    test: (p, v) => partyTags(p, v).includes('boat'),
  },
  {
    slug: 'raves', short: 'Raves', keyword: 'halloween rave nyc',
    h1: `Halloween Raves in NYC ${HW_YEAR}: Techno, EDM and Drum & Bass`,
    title: (n) => `Halloween Rave NYC ${HW_YEAR}: ${n} Techno and EDM Nights`,
    description: (n) => `Halloween raves in NYC for ${HW_YEAR}: ${n} techno, EDM and drum & bass nights, with doors, end times, age, price and tickets.`,
    lead: 'Techno, EDM and drum & bass nights for Halloween, plus parties that bill themselves as a rave.',
    test: (p) => p.genres.some((g) => RAVE.has(g)) || /\brave\b/i.test(p.title),
  },
  {
    slug: 'disco', short: 'Disco', keyword: 'halloween disco party nyc',
    h1: `Halloween Disco Parties in NYC ${HW_YEAR}`,
    title: (n) => `Halloween Disco Party NYC ${HW_YEAR}: ${n} Parties`,
    description: (n) => `Halloween disco parties in NYC for ${HW_YEAR}: ${n} disco and nu-disco nights with doors, age, price and tickets.`,
    lead: 'Disco and nu-disco nights for Halloween.',
    test: (p) => p.genres.includes('disco'),
  },
  {
    slug: 'free', short: 'Free', keyword: 'free halloween parties nyc',
    h1: `Free Halloween Parties in NYC ${HW_YEAR}`,
    title: (n) => `Free Halloween Parties NYC ${HW_YEAR}: ${n} Free Nights`,
    description: (n) => `Free Halloween parties in NYC for ${HW_YEAR}: ${n} parties free to enter, with doors, age and how to get in from each listing.`,
    lead: 'Free to enter, per the ticket page. Free nights often need an RSVP and can fill up, so register early.',
    test: (p) => p.price_status === 'free',
  },
];

export interface HwBuilt { page: HwPage; parties: Party[]; indexable: boolean }
let cache: Promise<{ all: Party[]; venues: Venue[]; built: HwBuilt[] }> | null = null;
export function halloweenPages() {
  cache ??= (async () => {
    const { parties, venues } = await partyData();
    const all = parties.filter((p) => p.themes.includes('halloween'));
    const built = HW_PAGES.map((page) => {
      const list = all.filter((p) => page.test(p, venueOf(p, venues)));
      return { page, parties: list, indexable: list.length >= MIN };
    });
    return { all, venues, built };
  })();
  return cache;
}
