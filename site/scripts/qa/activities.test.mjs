/**
 * QA: the trivia time logic, run against the real module (bundled with esbuild).
 *   node scripts/qa/activities.test.mjs
 */
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const out = '/tmp/yay-activities-test.mjs';
await build({ entryPoints: ['src/lib/activities.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const A = await import(out);
const t = (day, start) => ({ key: 'x', v: Object.keys(A.venues)[0], kind: 'trivia', musicTrivia: false, day, start, startLabel: null, rec: '', recKind: 'not_established', host: null, prize: null, prizeSource: null, operator: false, sources: [] });
const bar = (windows) => ({ windows });
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('happy hour covering the start is "during"', () => assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: '17:00', end: '20:00' }]), t('tue', '19:30')).kind, 'during'));
ok('happy hour ending an hour before is "before"', () => assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: '16:00', end: '19:00' }]), t('tue', '20:00')).kind, 'before'));
ok('more than two hours before is no overlap', () => assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: '15:00', end: '17:00' }]), t('tue', '20:00')), null));
ok('another day is no overlap', () => assert.equal(A.hhOverlap(bar([{ days: ['mon'], start: '17:00', end: '20:00' }]), t('tue', '19:00')), null));
ok('a window past midnight covers a late game', () => assert.equal(A.hhOverlap(bar([{ days: ['fri'], start: '22:00', end: '02:00' }]), t('fri', '23:00')).kind, 'during'));
ok('an unknown start or end never counts', () => {
  assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: null, end: '20:00' }]), t('tue', '19:00')), null);
  assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: '17:00', end: null }]), t('tue', '19:00')), null);
});
ok('a night with no start time never overlaps', () => assert.equal(A.hhOverlap(bar([{ days: ['tue'], start: '17:00', end: '20:00' }]), t('tue', null)), null));
ok('a bar we do not have never overlaps', () => assert.equal(A.hhOverlap(undefined, t('tue', '19:00')), null));
ok('source label states the schedule week only when the source does', () => {
  assert.match(A.sourceLabel({ name: 'NYC Trivia League', url: null, observed_at: '2026-10-16', source_updated_at: '2026-10-12/2026-10-18' }), /schedule for Oct 12–Oct 18, 2026, read Oct 16, 2026/);
  assert.equal(A.sourceLabel({ name: 'NYC Trivia List', url: null, observed_at: '2026-10-16', source_updated_at: null }), 'NYC Trivia List (read Oct 16, 2026)');
});
ok('music bingo is never in the trivia list', () => assert.equal(A.trivia.filter((x) => x.kind !== 'trivia').length, 0));
ok('"weekly" only where a source said so', () => {
  for (const x of [...A.trivia, ...A.bingo]) if (/^weekly/i.test(x.rec)) assert.equal(x.recKind, 'weekly_stated', x.key);
});
ok('every venue is in one of the five boroughs', () => {
  for (const v of Object.values(A.venues)) assert.ok(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].includes(v.borough), v.name);
});
// the browser "tonight" logic: New York's weekday, also across the DST change (Nov 1, 2026, 2am)
const nyDay = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(iso));
ok('New York weekday at 11:30pm Saturday Oct 31 (UTC is already Sunday)', () => assert.equal(nyDay('2026-11-01T03:30:00Z'), 'Saturday'));
ok('New York weekday after the DST change (1:30am Sunday Nov 1, EST)', () => assert.equal(nyDay('2026-11-01T06:30:00Z'), 'Sunday'));
ok('New York weekday at 7pm Monday in March after DST starts', () => assert.equal(nyDay('2027-03-15T23:00:00Z'), 'Monday'));
console.log(`${n} passed`);
