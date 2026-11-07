/**
 * Approve attraction pages after the owner reviewed the rendered page (docs/ATTRACTIONS.md).
 *   node scripts/attractions-approve.mjs <id> [<id> ...]     approve (stores today's record as the snapshot)
 *   node scripts/attractions-approve.mjs --refresh <id>      re-approve after a re-review (new snapshot)
 * Only launch_candidate = "yes" records can be approved. Nothing is ever removed here: taking a page
 * down is a separate, deliberate decision (it needs a 301 or a 410 plan, see the docs).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = new URL('../src/data/nyc_attractions.json', import.meta.url);
const APPROVED = new URL('../src/data/attractions-approved.json', import.meta.url);
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) { console.log('usage: node scripts/attractions-approve.mjs [--refresh] <id> [<id> ...]'); process.exit(1); }

const records = new Map(JSON.parse(readFileSync(DATA, 'utf-8')).records.map((r) => [r.id, r]));
const file = JSON.parse(readFileSync(APPROVED, 'utf-8'));
file.approved ??= {};
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
let bad = 0;
for (const id of ids) {
  const r = records.get(id);
  if (!r) { console.log(`✗ ${id}: not in the data file`); bad++; continue; }
  if (r.launch_candidate !== 'yes') { console.log(`✗ ${id}: not a launch candidate (tier ${r.record_tier})`); bad++; continue; }
  if (file.approved[id] && !refresh) { console.log(`= ${id}: already approved on ${file.approved[id].approved_at} (use --refresh after a re-review)`); continue; }
  file.approved[id] = { approved_at: today, snapshot: r };
  console.log(`✓ ${id}: approved ${today}`);
}
writeFileSync(APPROVED, JSON.stringify(file, null, 1) + '\n');
process.exit(bad ? 1 : 0);
