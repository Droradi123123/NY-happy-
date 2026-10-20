/**
 * /data/quality.json: how complete and how fresh the happy-hour data is, recomputed at every build
 * from the live records. The build log prints the summary (scripts/verify-build.mjs), so each
 * deploy shows whether the data is getting better: a published deal, read on the bar's own site
 * recently, in the neighborhood its address record gives.
 */
import { allBars, copyOf, hoodMismatch } from '../../lib/data';
import { tier, FRESH_DAYS } from '../../lib/lists';

export async function GET() {
  const bars = await allBars();
  const since = new Date(Date.now() - FRESH_DAYS * 86400e3).toISOString().slice(0, 10);
  const hoodNames = [...new Set(bars.map((b) => b.hood).filter(Boolean))];
  const noDeal = bars.filter((b) => !b.dealKnown);
  const stale = bars.filter((b) => (b.checked?.slice(0, 10) ?? '') < since);
  const both = bars.filter((b) => !b.dealKnown && (b.checked?.slice(0, 10) ?? '') < since);
  const doubt = bars.filter((b) => b.doubt);
  const mismatch: string[] = [];
  for (const b of bars) {
    const c = await copyOf('bar', b.slug);
    if (c && [c.intro, ...c.sections.map((s) => s.body), ...(c.faq ?? []).map((f) => f.a)].some((t) => hoodMismatch(t, b, hoodNames))) mismatch.push(b.slug);
  }
  const pct = (n: number) => Math.round((n / bars.length) * 1000) / 10;
  const byTier = [0, 1, 2, 3].map((t) => bars.filter((b) => tier(b, since) === t).length);
  const out = {
    built: new Date().toISOString(), bars: bars.length, fresh_days: FRESH_DAYS,
    useful: { count: byTier[0], pct: pct(byTier[0]), note: 'deal published and read on the bar\'s own site in the last 30 days' },
    no_deal: { count: noDeal.length, pct: pct(noDeal.length) },
    stale: { count: stale.length, pct: pct(stale.length) },
    no_deal_and_stale: { count: both.length, pct: pct(both.length) },
    deal_in_doubt: { count: doubt.length, pct: pct(doubt.length) },
    copy_names_other_hood: { count: mismatch.length, pct: pct(mismatch.length), note: 'shown corrected on the page until the copy is rewritten' },
    tiers: { deal_fresh: byTier[0], deal_stale: byTier[1], times_only_fresh: byTier[2], times_only_stale: byTier[3] },
    worklist: {
      no_deal_and_stale: both.map((b) => b.slug),
      copy_names_other_hood: mismatch,
    },
  };
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } });
}
