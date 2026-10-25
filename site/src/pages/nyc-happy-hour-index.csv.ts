/** The price index's data, one row per bar (lib/priceIndex.ts), CC BY 4.0. */
import type { APIRoute } from 'astro';
import { priceIndex, KINDS } from '../lib/priceIndex';
import { SITE } from '../lib/seo';

const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const GET: APIRoute = async () => {
  const ix = await priceIndex();
  const head = ['bar', 'neighborhood', 'borough', ...KINDS.map((k) => `${k.id}_usd`), 'checked', 'url'];
  const lines = ix.rows.map((r) => [r.name, r.hood, r.borough, ...KINDS.map((k) => r.prices[k.id] ?? ''), r.checked, `${SITE}/bars/${r.slug}`].map(cell).join(','));
  return new Response([`# NYC Happy Hour Price Index, YaY NYC, built ${ix.built}. CC BY 4.0: credit "YaY NYC" with a link to ${SITE}/nyc-happy-hour-index. Cheapest happy-hour price per kind of drink, from each bar's own menu, before tax and tip.`, head.join(','), ...lines].join('\n'),
    { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
