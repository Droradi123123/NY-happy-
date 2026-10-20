/**
 * Titles, descriptions and JSON-LD. Lessons carried over from HappyTLV (Search Console):
 * people search a bar by name, so the title starts with the name; the deal itself
 * ("$6 drafts", "2-for-1") is what Google's own listing never shows, so it goes in the
 * title when it is short; every description is built from the page's own facts.
 */
import { DAYS, DAY_NAME, ampm, daysLabel, dealLabel, windowLabel, type Bar, type Party, type Venue, cleanTitle, nightDate, nyTime, priceLabel } from './data';

export const SITE = 'https://yaynyc.com';
const fit = (parts: string[], max = 60) => { for (const p of parts) if (p.length <= max) return p; return parts[parts.length - 1]; };
const cut = (s: string, n = 155) => { if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[\s,.;:·-]+$/, '') + '…'; };

/** the search phrase a bar page targets; a chain's branches add their neighborhood */
export const barKeyword = (b: Bar, branch = false) => `${b.name}${branch ? ` ${b.hood}` : ''} happy hour`;
/** "4pm–7pm" -> "4–7pm" when both ends share am/pm (titles have about 60 characters) */
const compactWindow = (w: Bar['windows'][number]) => windowLabel(w).replace(/^(\d{1,2}(?::\d{2})?)(am|pm)–(\d{1,2}(?::\d{2})?)\2$/, '$1–$3$2');
const whenLabel = (b: Bar) => (b.windows[0] ? `${daysLabel(b.windows[0].days)} ${compactWindow(b.windows[0])}` : '');
/** the deal in a few words for a title: the bar's own short deal, else its cheapest drink */
const shortDeal = (b: Bar) => {
  const deal = dealLabel(b);
  if (deal && deal.length <= 22) return deal;
  return b.cheapestDrink !== null ? `drinks from $${b.cheapestDrink % 1 ? b.cheapestDrink.toFixed(2) : b.cheapestDrink}` : null;
};
// people search "<bar> menu" as often as "<bar> happy hour": "Happy Hour Menu" only when the page lists the items
const hasMenu = (b: Bar) => b.offers.length >= 2;
export function barTitle(b: Bar, branch = false): string {
  const short = shortDeal(b);
  const when = whenLabel(b);
  const name = branch ? `${b.name} ${b.hood}` : b.name;
  const hh = hasMenu(b) ? 'Happy Hour Menu' : 'Happy Hour';
  return fit([
    short ? `${name} ${hh}: ${short}, ${when}` : '',
    short ? `${name} Happy Hour: ${short}, ${when}` : '',
    short ? `${name} ${hh}: ${short}` : '',
    branch ? '' : `${name} Happy Hour, ${b.hood}: ${when}`,
    `${name} Happy Hour: ${when}`,
    `${name} Happy Hour: Times and Deals`,
    `${name} Happy Hour`,
  ].filter(Boolean));
}
export function barDescription(b: Bar): string {
  const deal = dealLabel(b);
  const sched = b.windows.map((w) => `${daysLabel(w.days)} ${compactWindow(w)}`).join(', ');
  const menu = b.offers.slice(0, 3).map((o) => `${o.item} ${o.price}`).join(', ');
  const bits = hasMenu(b)
    ? [`Happy hour menu at ${b.name}, ${b.hood}: ${menu}${b.offers.length > 3 ? ' and more' : ''}.`, `${sched}.`]
    : [`${b.name} in ${b.hood} has happy hour ${sched}.`, deal ? `The deal: ${deal}.` : 'Times are published; the deal is not listed.'];
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
export function partyTitle(p: Party, v: Venue | null): string {
  const t = cleanTitle(p.title).replace(/\s*[|·]\s*.*$/, '');
  const d = nightDate(p.night_date, { month: 'short', day: 'numeric' });
  return fit([`${t} at ${v?.name ?? 'NYC'}, ${d}: Tickets, Time, Lineup`, `${t} at ${v?.name ?? 'NYC'}, ${d}`, `${t}, ${d}`]);
}
export function partyDescription(p: Party, v: Venue | null): string {
  const lead = p.copy?.about?.split(/(?<=\.)\s/)[0];
  return cut([
    `${partyName(p)} at ${v?.name ?? 'a NYC venue'}${p.neighborhood ? `, ${p.neighborhood}` : ''}: ${nightDate(p.night_date, { weekday: 'long', month: 'short', day: 'numeric' })}${nyTime(p.doors_at ?? p.starts_at) ? `, doors ${nyTime(p.doors_at ?? p.starts_at)}` : ''}.`,
    lead ?? '',
    `${priceLabel(p)}${p.age_min ? `, ${p.age_min}+` : ''}.`,
  ].filter(Boolean).join(' '));
}
export function partyJsonLd(p: Party, v: Venue | null, url: string) {
  return {
    '@context': 'https://schema.org', '@type': 'MusicEvent', name: cleanTitle(p.title), url,
    startDate: p.starts_at, ...(p.ends_at ? { endDate: p.ends_at } : {}), ...(p.doors_at ? { doorTime: p.doors_at } : {}),
    eventStatus: `https://schema.org/${{ scheduled: 'EventScheduled', postponed: 'EventPostponed', rescheduled: 'EventRescheduled', cancelled: 'EventCancelled', sold_out: 'EventScheduled' }[p.event_status] ?? 'EventScheduled'}`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(p.copy?.about ? { description: p.copy.about } : {}),
    location: { '@type': 'Place', name: v?.name, ...(v?.address ? { address: v.address } : {}), ...(v?.lat ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}) },
    ...(p.performers.length ? { performer: p.performers.map((n) => ({ '@type': 'PerformingGroup', name: n })) } : {}),
    ...(p.organizer ? { organizer: { '@type': 'Organization', name: p.organizer } } : {}),
    offers: { '@type': 'Offer', url: p.ticket_url, ...(p.price_from !== null ? { price: p.price_from, priceCurrency: 'USD' } : {}), availability: `https://schema.org/${p.event_status === 'sold_out' ? 'SoldOut' : 'InStock'}` },
    ...(p.age_min ? { typicalAgeRange: `${p.age_min}-` } : {}),
  };
}
export { DAY_NAME, ampm };
