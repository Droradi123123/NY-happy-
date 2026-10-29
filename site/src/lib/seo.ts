/**
 * Titles, descriptions and JSON-LD. Lessons carried over from HappyTLV (Search Console):
 * people search a bar by name, so the title starts with the name; the deal itself
 * ("$6 drafts", "2-for-1") is what Google's own listing never shows, so it goes in the
 * title when it is short; every description is built from the page's own facts.
 */
import { DAYS, DAY_NAME, ampm, daysLabel, dealLabel, windowLabel, type Bar, type Party, type Venue, cleanTitle, nightDate, nyTime, priceLabel } from './data';

export const SITE = 'https://yaynyc.com';
const BRAND = ' | YaY NYC';
// the same word rules as the build gate (scripts/verify-build.mjs): whole words, simple plurals
const STOP = new Set(['in', 'at', 'the', 'a', 'an', 'of', 'and', 'for', 'on', 'to', 'by', 'with']);
const wordSet = (t: string) => new Set(t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9$]+/).filter(Boolean));
const hasWord = (set: Set<string>, w: string) => set.has(w) || set.has(`${w}s`) || set.has(w.replace(/s$/, '')) || set.has(w.replace(/es$/, '')) || set.has(w.replace(/ies$/, 'y')) || set.has(w.replace(/y$/, 'ies'));
const hasAll = (t: string, kw: string) => { const got = wordSet(t); return [...wordSet(kw)].filter((w) => !STOP.has(w)).every((w) => hasWord(got, w)); };
/** a phrase cut at a word: no trailing punctuation or dangling little word ("... in NYC Every") */
const WEAK = /\s+(at|in|on|for|and|with|the|of|&|every|from|to|by|a|an|ft\.?|feat\.?|x|w\/|\+)$/i;
export const cutWords = (t: string) => { let x = t.replace(/[\s,:;·|–(-]+$/, ''); while (WEAK.test(x)) x = x.replace(WEAK, '').replace(/[\s,:;·|–(-]+$/, ''); return x; };
const cutTo = (t: string, n: number) => { if (t.length <= n) return t; const ws = t.split(' '); let out = ''; for (const w of ws) { if ((out ? `${out} ${w}` : w).length > n) break; out = out ? `${out} ${w}` : w; } return cutWords(out); };
/**
 * The page title, at most 60 characters (what Google shows), never cut in the middle of a word:
 * the candidates come longest first; " | YaY NYC" goes first, then the next shorter candidate; when none
 * fits, the first is cut at a word boundary that keeps the target keyword; a name longer than that stays
 * whole (the build warns about it).
 */
export function fitTitle(candidates: string[], keyword?: string, max = 60): string {
  const cs = candidates.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (cs[0] && (cs[0] + BRAND).length <= max) return cs[0] + BRAND;
  for (const c of cs) if (c.length <= max && (!keyword || hasAll(c, keyword))) return c;
  const first = cs[0] ?? '';
  const ws = first.split(' ');
  for (let n = ws.length - 1; n > 0; n--) {
    const t = cutWords(ws.slice(0, n).join(' '));
    // never leave a lone word after a colon ("Halloween Parties NYC: 28")
    if (/:\s*\S+$/.test(t)) continue;
    if (t.length <= max && (!keyword || hasAll(t, keyword))) return t;
  }
  return first;
}
const cut = (s: string, n = 155) => { if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[\s,.;:·-]+$/, '') + '…'; };

/** the search phrase a bar page targets; a chain's branches add their neighborhood */
export const barKeyword = (b: Bar, branch = false) => `${b.name}${branch ? ` ${b.hood}` : ''} happy hour`;
/** "4pm–7pm" -> "4–7pm" when both ends share am/pm (titles have about 60 characters) */
const compactWindow = (w: Bar['windows'][number]) => windowLabel(w).replace(/^(\d{1,2}(?::\d{2})?)(am|pm)–(\d{1,2}(?::\d{2})?)\2$/, '$1–$3$2');
// people search "<bar> menu" as often as "<bar> happy hour": "Happy Hour Menu" only when the page lists the items
const hasMenu = (b: Bar) => b.offers.length >= 2;
// the title format people search for a bar: "[Name] [Neighborhood]: Happy Hour, Hours & Menu"; "Hours"
// only when we have its opening hours, "Menu" only when the page lists the items; the deal leads the description
export function barTitle(b: Bar, branch = false): string {
  const parts = ['Happy Hour', b.hours ? 'Hours' : null, hasMenu(b) ? 'Menu' : null].filter(Boolean) as string[];
  const what = parts.length === 1 ? 'Happy Hour Times' : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  const name = branch ? `${b.name} ${b.hood}` : b.name;
  return fitTitle([
    branch ? '' : `${name} ${b.hood}: ${what}`,
    `${name}: ${what}`,
    branch ? '' : `${name} ${b.hood} Happy Hour`,
    `${name} Happy Hour`,
  ].filter(Boolean), barKeyword(b, branch)).replace(/ \| YaY NYC$/, '');
}
export function barDescription(b: Bar): string {
  const deal = dealLabel(b);
  const sched = b.windows.map((w) => `${daysLabel(w.days)} ${compactWindow(w)}`).join(', ');
  const menu = b.offers.slice(0, 3).map((o) => `${o.item} ${o.price}`).join(', ');
  // opens with the focus phrase ("<name> happy hour"), then the deal and the times
  const bits = hasMenu(b)
    ? [`${b.name} happy hour, ${b.hood}: ${menu}${b.offers.length > 3 ? ' and more' : ''}.`, `${sched}.`]
    : [`${b.name} happy hour, ${b.hood}: ${sched}.`, deal ? `The deal: ${deal}.` : b.source || b.website ? 'Times, a link to the bar\'s own menu and nearby deals.' : 'Times and nearby bars with listed deals.'];
  bits.push(
    b.subway ? `${b.subway.walk_min} min from ${b.subway.station} (${b.subway.lines.join(', ')}).` : '',
    b.checked ? `Checked ${new Date(b.checked).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : '',
  );
  return cut(bits.filter(Boolean).join(' '));
}

const SCHEMA_DAY: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export function barJsonLd(b: Bar, url: string) {
  const biz: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': b.category === 'restaurant' ? 'Restaurant' : 'BarOrPub',
    name: b.name, url,
    ...(b.address ? { address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: b.borough ?? 'New York', addressRegion: 'NY', addressCountry: 'US' } } : {}),
    ...(b.onMap ? { geo: { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng } } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.priceRange && /^\$+$/.test(b.priceRange) ? { priceRange: b.priceRange } : {}),
    ...(b.cuisine ? { servesCuisine: b.cuisine } : {}),
    ...(b.booking ? { acceptsReservations: true } : {}),
    sameAs: [b.website, b.instagram].filter(Boolean),
  };
  if (b.hours) {
    biz.openingHoursSpecification = DAYS.filter((d) => b.hours![d]).map((d) => {
      const [o, c] = b.hours![d]!.split('-');
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${SCHEMA_DAY[d]}`, opens: o, closes: c === '24:00' ? '23:59' : c };
    });
  }
  // the happy hour is an offer with its own hours, not the opening hours
  biz.makesOffer = {
    '@type': 'Offer', name: `Happy hour at ${b.name}`, ...(dealLabel(b) ? { description: dealLabel(b) } : {}),
    itemOffered: {
      '@type': 'Service', name: 'Happy hour',
      hoursAvailable: b.windows.filter((w) => w.start || w.end).map((w) => ({
        '@type': 'OpeningHoursSpecification', dayOfWeek: w.days.map((d) => `https://schema.org/${SCHEMA_DAY[d]}`),
        ...(w.start ? { opens: w.start } : {}), ...(w.end ? { closes: w.end === '24:00' ? '23:59' : w.end } : {}),
      })),
    },
  };
  return biz;
}

/** "Updated Oct 29" for descriptions (the page is rebuilt from the data every few hours) */
export const updatedLabel = (d = new Date()) => `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`;
/** a list page's description: the focus phrase first, then "Updated Oct 29", then as many of the facts
 *  as fit in 160 characters (whole sentences, in order) */
export function freshDescription(focus: string, facts: string[], min = 70): string {
  let d = `${focus[0].toUpperCase()}${focus.slice(1)}. ${updatedLabel()}.`;
  for (const f of facts.filter(Boolean)) if (`${d} ${f}`.length <= 160) d = `${d} ${f}`;
  if (d.length < min) d = `${d} Times, prices and links, checked daily.`;
  return d.length > 160 ? cut(d, 160) : d;
}
/** a list page as schema.org CollectionPage: when its data last changed, and what is on it */
export function collectionLd(name: string, path: string, urls: string[], dateModified?: string | null) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name, url: `${SITE}${path}`,
    ...(dateModified ? { dateModified } : {}), isPartOf: { '@type': 'WebSite', name: 'YaY NYC', url: SITE },
    mainEntity: { '@type': 'ItemList', numberOfItems: urls.length, itemListElement: urls.slice(0, 100).map((u, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${u}` })) },
  };
}
export function crumbs(items: [string, string][]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
  };
}
export function faqLd(faq: { q: string; a: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
export function itemList(name: string, urls: string[]) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: urls.length, itemListElement: urls.slice(0, 100).map((u, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${u}` })) };
}

// ---------- parties ----------

/** the party's name as people search it: the title up to a colon or bar ("Boo Yourself") */
export const partyName = (p: Party) => cleanTitle(p.title).replace(/\s*[|·]\s*.*$/, '').replace(/:\s.*$/, '').trim();
/** crowded: another party has the same name that night, so the venue is what tells them apart and stays in */
export function partyTitle(p: Party, v: Venue | null, crowded = false, keyword?: string): string {
  const t = cleanTitle(p.title).replace(/\s*[|·]\s*.*$/, '');
  const d = nightDate(p.night_date, { month: 'short', day: 'numeric' });
  const at = `at ${v?.name ?? 'NYC'}, ${d}`;
  const name = partyName(p);
  return fitTitle([`${t} ${at}: Tickets, Time, Lineup`, `${t} ${at}`, crowded && v ? `${name} ${at}` : `${t}, ${d}`,
    // a long name: cut at a word, the date stays (two nights of one party never share a title)
    crowded && v ? `${cutTo(name, 60 - at.length - 1)} ${at}` : `${cutTo(t, 60 - d.length - 2)}, ${d}`, `${cutTo(name, 60 - d.length - 2)}, ${d}`], keyword).replace(/ \| YaY NYC$/, '');
}
export function partyDescription(p: Party, v: Venue | null): string {
  const lead = p.copy?.about?.split(/(?<=\.)\s/)[0];
  return cut([
    `${partyName(p)} at ${v?.name ?? 'a NYC venue'}${p.neighborhood ? `, ${p.neighborhood}` : ''}: ${nightDate(p.night_date, { weekday: 'long', month: 'short', day: 'numeric' })}${nyTime(p.doors_at ?? p.starts_at) ? `, doors ${nyTime(p.doors_at ?? p.starts_at)}` : ''}.`,
    lead ?? '',
    `${priceLabel(p)}${p.age_min ? `, ${p.age_min}+` : ''}.`,
    // a short listing still gets a useful snippet (search engines want 70+ characters)
  ].filter(Boolean).join(' ').replace(/^(.{0,69})$/s, '$1 Doors, age, tickets and how to get there.'));
}
/** "123 Main St, Brooklyn, NY 11211, United States" as a schema.org PostalAddress (street, locality, zip) */
export function postalAddress(v: Venue) {
  const a = (v.address ?? '').replace(/,?\s*(United States|USA)$/, '');
  const zip = a.match(/\b(1\d{4})\b/)?.[1];
  const locality = v.borough === 'Manhattan' || !v.borough ? 'New York' : v.borough.replace(/^The /, '');
  return { '@type': 'PostalAddress', streetAddress: a.split(',')[0].trim(), addressLocality: locality, addressRegion: 'NY', ...(zip ? { postalCode: zip } : {}), addressCountry: 'US' };
}
export function partyJsonLd(p: Party, v: Venue | null, url: string) {
  return {
    '@context': 'https://schema.org', '@type': 'MusicEvent', name: cleanTitle(p.title), url,
    startDate: p.starts_at, ...(p.ends_at ? { endDate: p.ends_at } : {}), ...(p.doors_at ? { doorTime: p.doors_at } : {}),
    eventStatus: `https://schema.org/${{ scheduled: 'EventScheduled', postponed: 'EventPostponed', rescheduled: 'EventRescheduled', cancelled: 'EventCancelled', sold_out: 'EventScheduled' }[p.event_status] ?? 'EventScheduled'}`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(p.copy?.about ? { description: p.copy.about } : {}),
    location: { '@type': 'Place', name: v?.name, ...(v?.address ? { address: postalAddress(v) } : {}), ...(v?.lat ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}) },
    ...(p.performers.length ? { performer: p.performers.map((n) => ({ '@type': 'PerformingGroup', name: n })) } : {}),
    ...(p.organizer ? { organizer: { '@type': 'Organization', name: p.organizer } } : {}),
    offers: { '@type': 'Offer', url: p.ticket_url, ...(p.price_status === 'free' ? { price: 0, priceCurrency: 'USD' } : p.price_from !== null ? { price: p.price_from, priceCurrency: 'USD' } : {}), availability: `https://schema.org/${p.event_status === 'sold_out' ? 'SoldOut' : 'InStock'}`, ...(p.ticket_vendor ? { seller: { '@type': 'Organization', name: p.ticket_vendor } } : {}) },
    ...(p.price_status === 'free' ? { isAccessibleForFree: true } : {}),
    ...(p.age_min ? { typicalAgeRange: `${p.age_min}-` } : {}),
    ...(p.genres.length ? { keywords: p.genres.join(', ') } : {}),
    ...(p.last_checked ? { dateModified: p.last_checked } : {}),
  };
}
export { DAY_NAME, ampm };
