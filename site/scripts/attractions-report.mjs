/**
 * Attractions readiness report and review queue (docs/ATTRACTIONS.md), from the data file alone.
 *   node scripts/attractions-report.mjs [out.md]
 * One row per launch candidate: which facts are present, the checked date, the category and any flag
 * a reviewer should look at before approving the page. Then the review queue for approved pages.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/nyc_attractions.json', import.meta.url), 'utf-8'));
const approved = JSON.parse(readFileSync(new URL('../src/data/attractions-approved.json', import.meta.url), 'utf-8')).approved ?? {};
const recs = data.records;
const inNyc = (r) => typeof r.lat === 'number' && typeof r.lon === 'number' && r.lat >= 40.49 && r.lat <= 40.92 && r.lon >= -74.27 && r.lon <= -73.68;
const yes = (v) => (v ? 'yes' : '-');
const cands = recs.filter((r) => r.launch_candidate === 'yes');

const flags = (r) => {
  const f = [];
  if (r.notes) f.push(`note: ${r.notes}`);
  if (typeof r.lat === 'number' && !inNyc(r)) f.push(`coordinates ${r.lat}, ${r.lon} are outside NYC: map hidden`);
  if (typeof r.lat !== 'number') f.push('no coordinates: no map');
  if (!r.price_summary && r.price_flag !== 'free') f.push(`no price captured (flag ${r.price_flag}): official-site link shown`);
  if (!r.hours_recurring && !r.hours_observed) f.push('no hours captured: official-site link shown');
  if (/not captured|partial|varies|vary/i.test(`${r.hours_recurring} ${r.hours_observed}`)) f.push('hours partial or variable: shown as captured, with the date');
  if (/not captured|not verified/i.test(r.price_summary)) f.push('price partly captured: shown as captured');
  if (!r.address) f.push('no address: official-site link shown');
  if (!r.phone) f.push('no phone');
  if (!r.ticket_url) f.push('no ticket_url: button says "Official site"');
  return f;
};

const L = [];
L.push(`# Attractions readiness report`, '', `Data: ${data.metadata.record_count} records, generated ${data.metadata.generated_at}. Launch candidates: ${cands.length} (metadata says ${data.metadata.launch_candidate_count}). Approved: ${Object.keys(approved).length}.`, '');
const byCat = new Map();
for (const r of cands) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
L.push('## Candidates per category', '', '| Category | Candidates |', '|---|---|', ...[...byCat].map(([c, n]) => `| ${c} | ${n} |`), '');
L.push('## Per page', '', '| Page | Category | Address | Recurring hours | Observed hours | Price | Phone | Accessibility | Map coords | Checked | Approved |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of cands) L.push(`| [${r.name}](/attractions/${r.id}) | ${r.category} | ${yes(r.address)} | ${yes(r.hours_recurring)} | ${yes(r.hours_observed)} | ${r.price_summary ? 'yes' : r.price_flag === 'free' ? 'free (flag)' : '-'} | ${yes(r.phone)} | ${yes(r.accessibility)} | ${inNyc(r) ? 'yes' : typeof r.lat === 'number' ? 'OUTSIDE NYC' : '-'} | ${r.verified_at} | ${approved[r.id] ? approved[r.id].approved_at : 'no'} |`);
L.push('', '## Flags to review', '');
for (const r of cands) { const f = flags(r); L.push(`- **${r.id}**: ${f.length ? f.join('; ') : 'none'}`); }
L.push('', '## Review queue (approved pages)', '');
const byId = new Map(recs.map((r) => [r.id, r]));
const q = Object.entries(approved).flatMap(([id, a]) => {
  const cur = byId.get(id);
  if (!cur) return [`- ${id}: missing from the data drop (page keeps the approved snapshot, flagged "being re-verified")`];
  if (cur.launch_candidate !== 'yes') return [`- ${id}: no longer a candidate, tier ${cur.record_tier} (page keeps the approved snapshot, flagged)`];
  if (JSON.stringify(cur) !== JSON.stringify(a.snapshot)) return [`- ${id}: facts changed since approval (page shows new data; re-review, then --refresh)`];
  return [];
});
L.push(q.length ? q.join('\n') : 'Empty.');
const out = L.join('\n') + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], out);
console.log(out);
