import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hhBlocks, offersIn, windowIn, daysIn, readDeal, kindOf } from './deal-parse.mjs';

const pairs = (t) => offersIn(t).offers.map((o) => `${o.item}=${o.price}`);

test('8th Street: prices in a flattened sentence, including "$2ea"', () => {
  const d = readDeal("Happy Hour 'til 8pm daily! *** select bottles for $32, select glasses $11*** AW SHUCKS! OYSTER HAPPY HOUR $2ea 4-8pm Monday-Thursday (212) 260-9463");
  assert.deepEqual(d.offers.map((o) => `${o.item}=${o.price}/${o.kind}`), ['select bottles=$32/drink', 'select glasses=$11/drink', 'OYSTER=$2/food']);
  assert.deepEqual(d.days, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
});

test('menu lines: item first or price first', () => {
  assert.deepEqual(pairs('Happy Hour 4-7pm\nDraft Beer $6\nHouse Wine - $8\n$10 Margarita'), ['Draft Beer=$6', 'House Wine=$8', 'Margarita=$10']);
});

test('a line with two prices is not paired', () => {
  const r = offersIn('Happy hour\nWine $9 / Bottle $32');
  assert.deepEqual(r.offers, []);
  assert.deepEqual(r.loose, ['$9', '$32']);
});

test('windows', () => {
  assert.deepEqual(windowIn('Monday Through Friday 3:00 pm – 6:00 pm'), { start: '15:00', end: '18:00', quote: '3:00 pm – 6:00 pm' });
  assert.equal(windowIn('happy hour 4-7pm').start, '16:00');
  assert.equal(windowIn('happy hour 11-2pm').start, '11:00');
  assert.deepEqual([windowIn('10pm-2am').start, windowIn('10pm-2am').end], ['22:00', '02:00']);
  assert.deepEqual(windowIn('Every Day — From Open to 7 PM'), { start: null, end: '19:00', quote: 'Open to 7 PM' });
  // a bare number range is not a time ("2-4 people", "21-25")
  assert.equal(windowIn('tables for 2-4 people'), null);
});

test('days', () => {
  assert.deepEqual(daysIn('Mon-Fri 4-7'), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(daysIn('Sunday through Thursday'), ['sun', 'mon', 'tue', 'wed', 'thu']);
  assert.deepEqual(daysIn('weekdays 3-6pm'), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(daysIn('Tuesday & Thursday'), ['tue', 'thu']);
  assert.equal(daysIn('4-7pm'), null);
});

test('a nav link alone is not a happy-hour passage', () => {
  assert.deepEqual(hhBlocks('Home Menu Happy Hour Events Contact'), []);
});

test('the passage stops at the next menu', () => {
  const b = hhBlocks('Happy Hour 4-6pm Beer $5 Dinner Menu Steak $40')[0];
  assert.ok(b.includes('$5') && !b.includes('$40'));
});

test('kind', () => {
  assert.equal(kindOf('Frozen Margarita'), 'drink');
  assert.equal(kindOf('Buffalo Wings'), 'food');
  assert.equal(kindOf('Chef special'), 'unknown');
});
