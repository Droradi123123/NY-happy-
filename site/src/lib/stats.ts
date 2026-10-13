/** Numbers for a page's opening lines, computed from the data at build time (the number on the screen is the number in the data). */
import { dealLabel, type Bar } from './data';

export function stats(bars: Bar[]) {
  const withPrice = bars.filter((b) => b.cheapestDrink !== null).sort((a, b) => a.cheapestDrink! - b.cheapestDrink!);
  const cheapest = withPrice[0] ?? null;
  return {
    n: bars.length,
    deals: bars.filter((b) => b.dealKnown).length,
    food: bars.filter((b) => b.hasFood).length,
    late: bars.filter((b) => b.late).length,
    weekend: bars.filter((b) => b.weekend).length,
    oysters: bars.filter((b) => b.oysters).length,
    cheapest,
    cheapestLabel: cheapest ? `$${cheapest.cheapestDrink} at ${cheapest.name}` : null,
    topDeals: bars.filter((b) => dealLabel(b)).slice(0, 3),
  };
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
