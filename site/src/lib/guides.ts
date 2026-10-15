/**
 * Blog guides. Written text is grounded in our own records (each bar named here was read from
 * its own site; dates are stated). The table in each guide is computed at build from the live
 * data (lib/guideTables.ts), so prices and times on the page always match the bar pages.
 *
 * status: 'draft' guides are not built and not in the sitemap (YAY_DRAFTS=1 builds them noindexed
 * for review). A published guide whose table is empty is built noindexed and left out of the sitemap.
 */
export interface Guide {
  slug: string; status: 'draft' | 'published'; published: string; updated: string;
  title: string; h1: string; short: string; keyword: string; description: string;
  answer: string;
  sections: { h2: string; paras: string[] }[];
  table?: string; tableTitle?: string; minRows?: number;
  method: string;
  related: [string, string][];
  /** posts written into the database: plain-text intro, ordered bar picks (optionally a walking route) and FAQ */
  intro?: string;
  picks?: { slug: string; why: string }[];
  route?: boolean;
  faq?: { q: string; a: string }[];
}

import { blogPosts, paragraphs } from './data';

const SEPT = 'Each bar’s happy hour was read from its own website or menu on September 1 to 3, 2026. On October 14 we fetched every page again: where the same prices still appear in the page text, the table says so; most menus are images, PDFs or load with JavaScript, so they could not be re-confirmed automatically and keep their September date. Prices are menu prices before NYC sales tax (8.875%) and tip.';
const a = (href: string, text: string) => `<a href="${href}">${text}</a>`;

export const GUIDES: Guide[] = [
  {
    slug: 'cheapest-happy-hours-nyc', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'The Cheapest Happy Hours in NYC, by Neighborhood (2026)', short: 'Cheapest happy hours',
    h1: 'The Cheapest Happy Hours in NYC, Neighborhood by Neighborhood', keyword: 'cheapest happy hours nyc',
    description: 'The cheapest happy hours in NYC by neighborhood: the lowest drink price we hold in each area, the bar, the hours and the date it was checked.',
    answer: 'The cheapest happy-hour drinks on our list cost $2 to $4: a $2 frozen margarita at Papacito’s in Greenpoint, $3 margaritas on Tuesdays at La Caverna on the Lower East Side, $3 well drinks at O’Flanagan’s on the Upper East Side and $3 drafts at Gebhard’s Beer Culture on the Upper West Side. The table below has the cheapest drink in every neighborhood with at least three priced happy hours.',
    sections: [
      { h2: 'Where a drink costs $3 or less', paras: [
        `${a('/bars/papacito-s-greenpoint', 'Papacito’s')} in Greenpoint lists a $2 frozen margarita, the lowest drink price we hold anywhere, and the same happy hour lists $1 tacos.`,
        `In Manhattan the floor is $3. ${a('/bars/la-caverna-lower-east-side', 'La Caverna')} on the Lower East Side runs $3 margaritas, but only on Tuesdays from 5pm to 9pm. ${a('/bars/o-flanagan-s-upper-east-side', 'O’Flanagan’s')} on the Upper East Side lists $3 well drinks, ${a('/bars/gebhard-s-beer-culture-upper-west-side', 'Gebhard’s Beer Culture')} on the Upper West Side $3 happy-hour drafts, and ${a('/bars/flying-cock-murray-hill', 'Flying Cock')} in Murray Hill a $3 espresso martini.`,
        `In Park Slope, ${a('/bars/200-fifth-park-slope', '200 Fifth')} lists $3 champagne: one of the few prices our October 14 re-check found again on the bar’s own page.`,
      ] },
      { h2: 'The $4 tier: beer and shots', paras: [
        `Most neighborhoods bottom out at $4 or $5, almost always for a draft beer or a well drink. ${a('/bars/post-no-bills-williamsburg', 'Post No Bills')} in Williamsburg lists $4 drafts and ${a('/bars/desmond-s-tavern-koreatown', 'Desmond’s Tavern')} in Koreatown a $4 pint.`,
      ] },
      { h2: 'What a cheap drink really costs', paras: [
        'Menu prices in New York do not include the 8.875% sales tax or the tip, so budget a few dollars more per drink than the number on the menu. Some prices apply only on certain days: check the day in the table.',
      ] },
    ],
    table: 'cheapest-by-hood', tableTitle: 'The cheapest drink in each neighborhood',
    method: `${SEPT} Two very low prices on our list (a $1.75 beer and "$1 drinks") are left out of this guide until a person confirms them.`,
    related: [['Drinks $6 and under', '/happy-hours/cheap-drinks'], ['Cheap beer', '/happy-hours/cheap-beer'], ['Happy hour right now', '/happy-hours/now'], ['All neighborhoods', '/happy-hours/neighborhoods']],
  },
  {
    slug: 'dollar-oysters-nyc', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'Dollar Oysters in NYC: Every Oyster Happy Hour We Track', short: 'Dollar oysters',
    h1: 'Dollar Oysters in NYC: Where the Oyster Happy Hours Are', keyword: 'dollar oysters nyc',
    description: 'Dollar oysters in NYC: the oyster happy hours we track, from $1 a piece in Red Hook, Bushwick and Midtown to $2 near Times Square, with times and dates.',
    answer: 'Five bars on our list price happy-hour oysters at $1: Brooklyn Crab in Red Hook, The Ten Bells in Bushwick, Valerie in Midtown, John Doe in Flatiron and Bayridge Sushi in Bay Ridge. Ten more sit between $1.50 and $2. Times, days and check dates for all of them are in the table.',
    sections: [
      { h2: 'The $1 oysters', paras: [
        `${a('/bars/brooklyn-crab-red-hook', 'Brooklyn Crab')} in Red Hook lists $1 oysters, but the page we read is its spring and summer menu, so confirm it is still running before you go in the cold months.`,
        `${a('/bars/the-ten-bells-brooklyn-bushwick', 'The Ten Bells')} in Bushwick and ${a('/bars/valerie-midtown', 'Valerie')} in Midtown both list $1 oysters, as do ${a('/bars/john-doe-craft-bar-kitchen-flatiron', 'John Doe Craft Bar & Kitchen')} in Flatiron and ${a('/bars/bayridge-sushi-bay-ridge', 'Bayridge Sushi')} in Bay Ridge.`,
      ] },
      { h2: '$1.50 to $2, and closer to the action', paras: [
        `${a('/bars/ten-bells-lower-east-side', 'Ten Bells')} on the Lower East Side and ${a('/bars/amelia-s-koreatown', 'Amelia’s')} in Koreatown are at $1.50; ${a('/bars/mayfield-prospect-heights', 'Mayfield')} in Prospect Heights at $1.75. At $2 the list grows: ${a('/bars/blue-fin-times-square', 'Blue Fin')} by Times Square, ${a('/bars/bar-francis-prospect-heights', 'Bar Francis')}, ${a('/bars/layla-williamsburg', 'Layla')}, ${a('/bars/legasea-bar-grill-koreatown', 'Legasea')}, ${a('/bars/the-bar-room-midtown', 'The Bar Room')} and ${a('/bars/the-grid-nolita', 'The GRID')}.`,
      ] },
      { h2: 'Before you order', paras: [
        'An oyster deal can come with a minimum order or apply only at the bar, and some name the oyster ("market oyster", "East Coast"). Where a bar states a condition or a variety, it is on the bar’s page; where it does not, we do not guess, so ask when you order.',
      ] },
    ],
    table: 'oysters', tableTitle: 'Every oyster deal we hold',
    method: SEPT,
    related: [['Oyster happy hours list', '/happy-hours/oysters'], ['Happy hour food deals', '/happy-hours/food'], ['Happy hour right now', '/happy-hours/now']],
  },
  {
    slug: 'reverse-happy-hour-nyc', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'Reverse Happy Hour NYC: Late-Night Deals After 10pm', short: 'Reverse happy hour',
    h1: 'Reverse Happy Hour in NYC: The Late-Night Deals Worth Staying Out For', keyword: 'reverse happy hour nyc',
    description: 'Reverse happy hour in NYC: bars with a second, late-night happy hour, from 10pm to 4am in Gramercy and Murray Hill to after 11pm near Times Square.',
    answer: 'The longest late happy hours on our list run until 4am: Barfly in Gramercy (10pm to 4am, Sunday to Thursday) and Blue Haven in Murray Hill (10pm to 4am, Sunday to Wednesday). Meller’s in the Upper East Side runs 11pm to 3am, and near Times Square Tanner Smith’s starts at 10pm every night.',
    sections: [
      { h2: 'Until 3am or 4am', paras: [
        `${a('/bars/barfly-gramercy', 'Barfly')} in Gramercy repeats its happy hour from 10pm to 4am, Sunday through Thursday. ${a('/bars/blue-haven-murray-hill', 'Blue Haven')} in Murray Hill does the same from 10pm to 4am, Sunday to Wednesday, listed as $2 off. Uptown, ${a('/bars/meller-s-sports-hub-grill-upper-east-side', 'Meller’s Sports Hub & Grill')} runs 11pm to 3am, Sunday to Thursday.`,
        `${a('/bars/lovers-of-today-east-village', 'Lovers of Today')} in the East Village is the latest of all: 2am to 4am, Sunday to Wednesday.`,
      ] },
      { h2: 'After a show near Times Square', paras: [
        `${a('/bars/tanner-smith-s-times-square', 'Tanner Smith’s')} starts a late happy hour at 10pm every night; ${a('/bars/bartley-dunne-s-times-square', 'Bartley Dunne’s')} at 11pm, Sunday to Wednesday. Further west, ${a('/bars/central-park-tavern-hell-s-kitchen', 'Central Park Tavern')} in Hell’s Kitchen starts at 10pm, Sunday to Thursday. These bars list a start time but not an end: the deal runs until they stop it.`,
      ] },
      { h2: 'Weekend-only late deals', paras: [
        `Most reverse happy hours skip Friday and Saturday. The exceptions on our list: ${a('/bars/bobo-greenwich-village', 'Bobo')} in Greenwich Village (10pm to midnight, Friday and Saturday), ${a('/bars/soho-diner-soho', 'Soho Diner')} (midnight to 2am, Friday and Saturday) and ${a('/bars/cozy-royale-williamsburg', 'Cozy Royale')} in Williamsburg (10pm to 11:30pm, Saturday and Sunday).`,
      ] },
    ],
    table: 'late-night', tableTitle: 'Every happy hour after 9pm on our list',
    method: SEPT,
    related: [['Late night happy hours list', '/happy-hours/late-night'], ['Happy hour right now', '/happy-hours/now'], ['Parties tonight', '/parties']],
  },
  {
    slug: 'best-weekend-happy-hours-nyc', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'The Best Weekend Happy Hours in NYC: Saturday and Sunday Deals', short: 'Weekend happy hours',
    h1: 'The Best Weekend Happy Hours in NYC, Saturday and Sunday', keyword: 'best weekend happy hours nyc',
    description: 'The best weekend happy hours in NYC: bars that run a deal on Saturday or Sunday, with the hours for each day and the price, cheapest first.',
    answer: 'Weekend happy hours are rarer than weekday ones, and Sunday is easier than Saturday: on October 14, 262 bars on our list ran a happy hour on Sunday and 230 on Saturday, out of 742. The table lists the ones with a published deal, cheapest first, with the Saturday and Sunday hours side by side.',
    sections: [
      { h2: 'Sunday beats Saturday', paras: [
        'More bars on our list discount Sunday than Saturday. If you can choose, choose Sunday, and check the hours for that day: they are not always the weekday hours.',
      ] },
      { h2: 'Weekend hours are often different', paras: [
        'A bar that runs 4pm to 7pm on weekdays may run 12pm to 5pm on Saturday, or only on Sunday. The table shows each day separately; "no" means the bar does not list a happy hour that day.',
      ] },
    ],
    table: 'weekend', tableTitle: 'Weekend happy hours with a published deal',
    method: SEPT,
    related: [['Saturday happy hours', '/happy-hours/saturday'], ['Sunday happy hours', '/happy-hours/sunday'], ['Weekend list', '/happy-hours/weekend']],
  },
  {
    slug: 'cheap-happy-hour-food-nyc', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'Cheap Happy Hour Food in NYC: Tacos, Sliders and Snacks with a Price', short: 'Cheap happy hour food',
    h1: 'Cheap Happy Hour Food in NYC: Tacos, Sliders and Snacks', keyword: 'cheap happy hour food nyc',
    description: 'Cheap happy hour food in NYC: dishes with a published happy-hour price, from $1 tacos in Greenpoint to $3 sliders on the Lower East Side, with hours and dates.',
    answer: 'Tacos are the cheapest happy-hour food on our list: $1 at Papacito’s in Greenpoint, $1.99 at Los Mismos Amigos in Flushing, $2 at 1 Republik in the West Village and $3 at El Coco in Chelsea and El Lugar Cantina in Flatiron. For $3 you can also get sliders at Hair of the Dog on the Lower East Side or nachos at Little Havana in Greenwich Village.',
    sections: [
      { h2: 'Tacos, the $1 to $3 dinner', paras: [
        `${a('/bars/papacito-s-greenpoint', 'Papacito’s')} in Greenpoint lists $1 tacos and $3 nachos at happy hour; ${a('/bars/los-mismos-amigos-flushing', 'Los Mismos Amigos')} in Flushing $1.99 tacos and ${a('/bars/1-republik-west-village', '1 Republik')} in the West Village $2 tacos. In Manhattan, ${a('/bars/el-coco-chelsea', 'El Coco')} in Chelsea and ${a('/bars/el-lugar-cantina-flatiron', 'El Lugar Cantina')} in Flatiron both list $3 tacos.`,
      ] },
      { h2: 'Bar food for $3 to $4', paras: [
        `${a('/bars/hair-of-the-dog-lower-east-side', 'Hair of the Dog')} on the Lower East Side lists $3 sliders and ${a('/bars/file-gumbo-bar-tribeca', 'Filé Gumbo Bar')} in Tribeca $3.50 beef sliders. ${a('/bars/little-havana-restaurant-greenwich-village', 'Little Havana')} in Greenwich Village has $3 nachos and ${a('/bars/oliver-s-astoria-astoria', 'Oliver’s')} in Astoria lists $3 appetizers.`,
      ] },
      { h2: 'Read the small print', paras: [
        'A food special can require a drink purchase or a minimum order, or apply only at the bar. When a bar states a condition it is on the bar’s page; when it does not, we do not assume one, so ask when you order.',
      ] },
    ],
    table: 'food', tableTitle: 'Happy-hour food with a price',
    method: `${SEPT} A $0.99 wings deal on our list is a weekly special rather than a happy hour, so it is not in the text.`,
    related: [['Happy hour food deals list', '/happy-hours/food'], ['Dollar oysters', '/blog/dollar-oysters-nyc'], ['Cheapest happy hours', '/blog/cheapest-happy-hours-nyc']],
  },
  {
    slug: 'pre-theater-drinks-times-square', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'Pre-Theater Drinks Near Times Square: Happy Hours Before a Show', short: 'Pre-theater drinks',
    h1: 'Pre-Theater Drinks Near Times Square: Happy Hours Before a Broadway Show', keyword: 'pre theater drinks times square',
    description: 'Pre-theater drinks near Times Square: happy hours within a few minutes’ walk of the Broadway theaters that end before an evening curtain, with walking times.',
    answer: 'The closest happy hour to the Broadway theaters on our list is Blue Fin, about two minutes from the heart of the theater district, 4pm to 6pm every day with $2 oysters. Gui Steakhouse (3pm to 7pm daily), Havana Central (3pm to 7pm weekdays) and Fushimi Times Square (4pm to 7pm daily) are all within four minutes.',
    sections: [
      { h2: 'Within five minutes of the theaters', paras: [
        `${a('/bars/blue-fin-times-square', 'Blue Fin')} is the closest: its happy hour runs 4pm to 6pm every day, with market oysters at $2. ${a('/bars/gui-steakhouse-times-square', 'Gui Steakhouse')} runs 3pm to 7pm daily, ${a('/bars/havana-central-times-square', 'Havana Central')} 3pm to 7pm on weekdays and ${a('/bars/fushimi-times-square-times-square', 'Fushimi Times Square')} 4pm to 7pm daily. ${a('/bars/hard-rock-cafe-times-square', 'Hard Rock Cafe')} has a 4pm to 6pm weekday happy hour.`,
        `A little further, ${a('/bars/lady-blue-hell-s-kitchen', 'Lady Blue')} runs 4pm to 7pm on weekdays, and ${a('/bars/starchild-rooftop-bar-lounge-times-square', 'Starchild Rooftop')} 5pm to 7pm, Tuesday to Thursday.`,
      ] },
      { h2: 'Timing it with your curtain', paras: [
        'Evening Broadway performances usually start at 7pm or 8pm; the exact time is on your ticket. A happy hour that ends at 6pm or 7pm leaves time to walk over and get through the doors. Matinee days (often Wednesday, Saturday and Sunday) suit the deals that start at 3pm.',
        'In New York the menu price does not include 8.875% sales tax or tip. Visitors: bars check ID, and the drinking age is 21; bring your passport.',
      ] },
    ],
    table: 'near:broadway-theater-district,times-square:18:30', tableTitle: 'Weekday happy hours near the theaters',
    method: SEPT,
    related: [['Happy hour near the Broadway theaters', '/happy-hours/near/broadway-theater-district'], ['Happy hour near Times Square', '/happy-hours/near/times-square'], ['Reverse happy hour, after the show', '/blog/reverse-happy-hour-nyc']],
  },
  {
    slug: 'after-work-drinks-grand-central-penn-station', status: 'published', published: '2026-10-14', updated: '2026-10-14',
    title: 'After-Work Drinks Near Grand Central and Penn Station', short: 'After-work drinks',
    h1: 'After-Work Drinks Near Grand Central and Penn Station', keyword: 'after work drinks near grand central',
    description: 'After-work drinks near Grand Central and Penn Station: weekday happy hours a few minutes from the trains, with the hours, the deal and the walking time.',
    answer: 'Near Grand Central, Little Biggs is the closest weekday happy hour on our list (about two minutes, 4pm to 8pm), followed by Albert’s Bar, Dos Caminos and Mulligan’s Pub. Near Penn Station, Muses 35 and Juniper run 4pm to 7pm every day and Alessa Cucina & Bar 4pm to 8pm on weekdays, all within about three minutes.',
    sections: [
      { h2: 'Grand Central', paras: [
        `${a('/bars/little-biggs-midtown', 'Little Biggs')} runs 4pm to 8pm on weekdays, the latest finish of the group. ${a('/bars/albert-s-bar-murray-hill', 'Albert’s Bar')} (3pm to 6pm), ${a('/bars/dos-caminos-murray-hill', 'Dos Caminos')} (3pm to 5pm) and ${a('/bars/mulligan-s-pub-murray-hill', 'Mulligan’s Pub')} (4pm to 7pm) are all within about four minutes. ${a('/bars/the-shakespeare-the-william-murray-hill', 'The Shakespeare')} starts earliest, at 11am, and ${a('/bars/hofbra-u-bierhaus-nyc-murray-hill', 'Hofbräu Bierhaus')} runs 4pm to 6:30pm, Monday to Thursday.`,
      ] },
      { h2: 'Penn Station and Madison Square Garden', paras: [
        `${a('/bars/muses-35-bar-karaoke-koreatown', 'Muses 35')} and ${a('/bars/juniper-koreatown', 'Juniper')} both run 4pm to 7pm every day, ${a('/bars/alessa-cucina-bar-koreatown', 'Alessa Cucina & Bar')} 4pm to 8pm on weekdays and ${a('/bars/tara-mor-nyc-koreatown', 'Tara Mor')} 4pm to 6:30pm on weekdays.`,
      ] },
    ],
    table: 'near:grand-central,penn-station-msg:17:30', tableTitle: 'Weekday happy hours near the two stations',
    method: SEPT,
    related: [['Happy hour near Grand Central', '/happy-hours/near/grand-central'], ['Happy hour near Penn Station', '/happy-hours/near/penn-station-msg'], ['Midtown happy hours', '/happy-hours/midtown']],
  },
];

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let _all: Promise<Guide[]> | null = null;
/** the guides in this file plus the posts written into the database (a slug defined here wins) */
export function allGuides(): Promise<Guide[]> {
  _all ??= (async () => {
    const own = new Set(GUIDES.map((g) => g.slug));
    const db: Guide[] = (await blogPosts()).filter((p) => !own.has(p.slug)).map((p) => ({
      slug: p.slug, status: 'published', published: p.published, updated: p.updated,
      title: p.title, h1: p.h1, short: p.short, keyword: p.keyword, description: p.description, answer: p.answer,
      // database prose is plain text: escaped here because sections render as HTML
      sections: p.sections.map((x) => ({ h2: x.h, paras: paragraphs(x.body).map(esc) })),
      ...(p.table_id ? { table: p.table_id } : {}), ...(p.table_title ? { tableTitle: p.table_title } : {}), ...(p.min_rows ? { minRows: p.min_rows } : {}),
      method: p.method, related: p.related, intro: p.intro, picks: p.picks, route: p.route, faq: p.faq,
    }));
    return [...GUIDES, ...db];
  })();
  return _all;
}

/** the bars a guide is about, in order: its picks, else the bars in its table */
export async function guideBars(g: Guide): Promise<string[]> {
  if (g.picks?.length) return g.picks.map((p) => p.slug);
  if (!g.table) return [];
  const { guideTable } = await import('./guideTables');
  const t = await guideTable(g.table);
  return [...new Set((t?.rows ?? []).flatMap((r) => r.map((c) => c.href?.match(/^\/bars\/([^/]+)$/)?.[1]).filter((x): x is string => !!x)))];
}
/** a guide's cover: the first of its bars with a photo of the place itself, else a street photo */
export async function guideCover(g: Guide) {
  const { placePhoto } = await import('./data');
  const slugs = await guideBars(g);
  let fallback = null;
  for (const s of slugs) {
    const pp = placePhoto('bar', s, null, null, false);
    if (pp?.rel === 'own') return pp;
    fallback ??= pp;
  }
  return fallback;
}
