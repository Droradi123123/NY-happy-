/**
 * Bars with a published happy-hour deal near each club (/parties/venue/<id>/bars): "bars near House of
 * Yes", "drinks before Knockdown Center". Built for a club with at least MIN_BUILD such bars within
 * RADIUS meters; indexed from MIN_INDEX bars when the club has nights listed or the page already ranks.
 */
import { allBars, partyData, meters, type Bar, type Venue } from './data';
import { pathKept } from './indexScope';

export const RADIUS = 1000;
const MIN_BUILD = 3, MIN_INDEX = 5;
export interface VenueBars { venue: Venue; bars: { b: Bar; m: number }[]; nights: number; indexable: boolean }
let cache: Promise<VenueBars[]> | null = null;
export function venueBars(): Promise<VenueBars[]> {
  cache ??= (async () => {
    const { parties, venuePages } = await partyData();
    const bars = (await allBars()).filter((b) => b.onMap && b.dealKnown && !b.doubt);
    const out: VenueBars[] = [];
    for (const v of venuePages) {
      if (!v.lat || !v.lng) continue;
      const near = bars.map((b) => ({ b, m: meters({ lat: v.lat!, lng: v.lng! }, { lat: b.lat!, lng: b.lng! }) })).filter((x) => x.m <= RADIUS).sort((a, b) => a.m - b.m);
      if (near.length < MIN_BUILD) continue;
      const nights = parties.filter((p) => p.venue_id === v.id).length;
      out.push({ venue: v, bars: near.slice(0, 24), nights, indexable: near.length >= MIN_INDEX && pathKept(`/parties/venue/${v.id}/bars`) /* index focus, Oct 31: only with impressions or visits */ });
    }
    return out;
  })();
  return cache;
}
