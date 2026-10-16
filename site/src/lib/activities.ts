/**
 * Trivia nights, music bingo and bars with games: the public records only.
 *
 * Source: src/data/activities.json, written by scripts/activities/export_site.py from the reviewed
 * publication manifest (research workbook + operator and directory pages read Oct 16, 2026 + NYC
 * GeoSearch addresses). Held listings (one source, paused, pinball-map leads, unresolved addresses)
 * are never in that file. Nothing here invents a cadence, a price or a date: "Listed on Tuesdays"
 * stays that unless a source said weekly.
 */
import raw from '../data/activities.json';
import { DAYS, DAY_NAME, slugify, type Bar, type Day } from './data';

export interface ActSource { name: string; url: string | null; observed_at?: string | null; source_updated_at?: string | null; type?: string }
export interface ActVenue { name: string; address: string; borough: string | null; hood: string | null; lat: number | null; lng: number | null; bar: string | null; partyVenue: string | null; website: string | null }
export interface Trivia {
  key: string; v: string; kind: 'trivia' | 'music_bingo'; musicTrivia: boolean; day: Day; start: string | null; startLabel: string | null;
  rec: string; recKind: 'weekly_stated' | 'non_weekly' | 'not_established'; host: string | null; prize: string | null; prizeSource: string | null;
  operator: boolean; sources: ActSource[];
}
export interface Game { key: string; v: string; cat: string; game: string; games: string | null; label: string | null; hours: string | null; cost: string | null; alcohol: 'yes' | 'beer_wine' | 'not_confirmed'; sources: ActSource[] }
interface Data { observed: string; workbook: string; venues: Record<string, ActVenue>; trivia: Trivia[]; games: Game[] }

const data = raw as unknown as Data;
export const OBSERVED = data.observed;
export const venues = data.venues;
export const venueOf = (k: string) => data.venues[k];
/** trivia (music trivia included) and music bingo are kept apart everywhere, including the counts */
export const trivia = data.trivia.filter((t) => t.kind === 'trivia');
export const bingo = data.trivia.filter((t) => t.kind === 'music_bingo');
export const games = data.games;

export const BOROUGH_PAGES: [string, string][] = [['manhattan', 'Manhattan'], ['brooklyn', 'Brooklyn'], ['queens', 'Queens']];
/** day pages: the days with enough nights to be worth a page of their own (Saturday has one listing: it stays on the hub) */
export const DAY_PAGES: Day[] = DAYS.filter((d) => trivia.filter((t) => t.day === d).length >= 5);
export const daySlugOf = (d: Day) => DAY_NAME[d].toLowerCase();

/** games with a page of their own; the rest are sections of the hub */
export const GAME_PAGES: { cat: string; slug: string; h1: string; keyword: string; short: string }[] = [
  { cat: 'arcade', slug: 'arcade-bars', h1: 'Arcade Bars in NYC', keyword: 'arcade bars nyc', short: 'Arcade bars' },
  { cat: 'pinball', slug: 'pinball-bars', h1: 'Pinball Bars in NYC', keyword: 'pinball bars nyc', short: 'Pinball bars' },
];
export const GAME_ORDER = ['arcade', 'pinball', 'bowling', 'shuffleboard', 'mini_golf', 'ping_pong', 'pool', 'darts', 'board_games', 'skee_ball', 'bocce', 'axe_throwing', 'smash_throwing'];
export const GAME_NAME: Record<string, string> = {
  arcade: 'Arcade games', pinball: 'Pinball', bowling: 'Bowling', shuffleboard: 'Shuffleboard', mini_golf: 'Mini golf', ping_pong: 'Ping pong',
  pool: 'Pool', darts: 'Darts', board_games: 'Board games', skee_ball: 'Skee-Ball', bocce: 'Bocce', axe_throwing: 'Axe throwing', smash_throwing: 'Glass-smash throwing',
};

const min = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
export const byTime = (a: Trivia, b: Trivia) => (min(a.start) ?? 9999) - (min(b.start) ?? 9999) || venueOf(a.v).name.localeCompare(venueOf(b.v).name);
export const uniqueVenues = (list: { v: string }[]) => new Set(list.map((x) => x.v)).size;

/** "NYC Trivia League (week of Oct 12-18, 2026), NYC Trivia List (read Oct 16, 2026)" */
const short = (iso: string) => new Date(`${iso}T12:00:00-05:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
export function sourceLabel(s: ActSource): string {
  if (s.source_updated_at && s.source_updated_at.includes('/')) {
    const [a, b] = s.source_updated_at.split('/');
    return `${s.name} (schedule for ${short(a).replace(/, \d{4}$/, '')}–${short(b)}, read ${short(s.observed_at!)})`;
  }
  return `${s.name} (read ${short(s.observed_at!)})`;
}

/**
 * Happy hour and trivia on the same day, from the bar's own published windows. "during": the happy hour
 * window covers the start of the game; "before": it ends within two hours before the start. A window
 * with no known start or end does not count. Nothing about prices is inferred: the bar page has the deal.
 */
export function hhOverlap(bar: Bar | undefined, t: Trivia): { kind: 'during' | 'before'; label: string } | null {
  if (!bar || !t.start) return null;
  const s = min(t.start)!;
  for (const w of bar.windows) {
    if (!w.days.includes(t.day) || !w.start || !w.end || w.start === 'open') continue;
    const a = min(w.start)!, e = min(w.end)!;
    const end = e <= a ? e + 1440 : e;
    const lab = `${ampm(w.start)}–${ampm(w.end)}`;
    if (a <= s && s < end) return { kind: 'during', label: `Happy hour ${lab} runs into the game` };
    if (end <= s && s - end <= 120) return { kind: 'before', label: `Happy hour ${lab} ends before the game` };
  }
  return null;
}
const ampm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 || h === 24 ? 'am' : 'pm'}`; };

export const hoodAnchor = (h: string | null) => slugify(h ?? 'other');
