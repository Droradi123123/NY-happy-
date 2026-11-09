/** The NYE price index's data, one row per NYE night (lib/nyePrices.ts), CC BY 4.0. */
import type { APIRoute } from 'astro';
import { nyePrices } from '../lib/nyePrices';
import { partyData, venueOf, cleanTitle } from '../lib/data';
import { SITE } from '../lib/seo';

const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const GET: APIRoute = async () => {
  const ix = await nyePrices();
  const { venues } = await partyData();
  const head = ['party', 'venue', 'borough', 'night', 'cheapest_ticket_usd', 'free', 'sold_out', 'ticket_seller', 'checked', 'url'];
  const lines = ix.nights.map((p) => [cleanTitle(p.title), venueOf(p, venues)?.name ?? '', p.borough ?? '', p.night_date, p.price_status === 'free' ? 0 : p.price_from ?? '',
    p.price_status === 'free' ? 'yes' : 'no', p.event_status === 'sold_out' ? 'yes' : 'no', p.ticket_vendor ?? '', (p.last_checked ?? '').slice(0, 10), `${SITE}/parties/${p.slug}`].map(cell).join(','));
  return new Response([`# NYC New Year's Eve Price Index, YaY NYC, built ${ix.built}. CC BY 4.0: credit "YaY NYC" with a link to ${SITE}/nyc-nye-price-index. Cheapest ticket listed by the seller when last checked, with fees where shown.`, head.join(','), ...lines].join('\n'),
    { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
