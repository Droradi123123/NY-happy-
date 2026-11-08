/**
 * Turns an attraction's stated weekly schedule (hours_recurring, free text read from the official site)
 * into day-by-day opening times, strictly: a string is parsed only when every clause is understood.
 * Anything vague ("hours vary", "not captured", "select Tue", two venues with their own hours, no
 * days given) gives null, and the page then makes no open/closed claim. Days a schedule does not
 * name stay unknown (never assumed closed). Holiday closures are not modeled: the page says so.
 *
 *   "Wed-Sun 11 am-6 pm; closed Mon-Tue"  ->  [{ days: { 0: [660,1080], 1: 'closed', ... } }]
 *   "Winter (Nov 1, 2026-Mar 25, 2027): daily 10:00 AM-4:30 PM; summer (...)"  ->  one segment per season
 * Times are minutes after midnight, New York time; 1440 = midnight closing.
 */
export type DayHours = [number, number] | 'closed';
export interface HoursSegment { from?: string; to?: string; days: Partial<Record<number, DayHours>> }

const DAY: Record<string, number> = { sun: 0, sunday: 0, sundays: 0, mon: 1, monday: 1, mondays: 1, tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, wednesday: 3, wednesdays: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4, fri: 5, friday: 5, fridays: 5, sat: 6, saturday: 6, saturdays: 6 };
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const VAGUE = /vary|varies|not captured|partial|select|separate schedule|per site|specific hours|seasonally|shop|dining/i;
const HOLIDAY = /thanksgiving|christmas|new year|mlk|juneteenth|december 25|holiday(?!s \d)|labor day|memorial day/i;

const range = (a: number, b: number) => { const out: number[] = []; for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; } return out; };
/** "Mon-Fri", "Sun/Mon/Sat", "Mon, Tue, Sat", "daily", "Monday-Sunday", "weekends", "Wednesdays" -> day numbers, or null */
function days(s: string): number[] | null {
  const t = s.toLowerCase().replace(/\bopen\b/g, '').replace(/\band federal holidays\b/g, '').trim();
  if (/^(daily|every day)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^weekends?$/.test(t)) return [6, 0];
  const parts = t.split(/\s*(?:,|\/|\band\b)\s*/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const m = p.match(/^([a-z]+)\s*-\s*([a-z]+)$/);
    if (m) { if (!(m[1] in DAY) || !(m[2] in DAY)) return null; out.push(...range(DAY[m[1]], DAY[m[2]])); continue; }
    if (!(p in DAY)) return null;
    out.push(DAY[p]);
  }
  return out.length ? [...new Set(out)] : null;
}
/** one clock time; ampm forced when the text gives none */
function clock(s: string, mer: 'am' | 'pm' | null): number | null {
  const m = s.trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon|midnight)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0); const ap = (m[3] as string | undefined) ?? mer;
  if (h > 12 || min > 59) return null;
  if (m[3] === 'noon') return 720;
  if (m[3] === 'midnight') return 1440;
  if (!ap) return null;
  if (ap === 'am') h = h === 12 ? 0 : h; else h = h === 12 ? 12 : h + 12;
  return h * 60 + min;
}
/** "10:00 AM-4:30 PM", "11 am-6 pm", "10-6", "12-5 pm", "1:00-5:00 pm", "8 AM-12 AM" -> [open, close] */
function times(s: string): [number, number] | null {
  const m = s.trim().match(/^(.+?)\s*-\s*(.+)$/);
  if (!m) return null;
  const [a, b] = [m[1], m[2]];
  const am = /(am|pm|a\.m\.|p\.m\.)/i;
  const bMer = (b.match(am)?.[1].replace(/\./g, '').toLowerCase() as 'am' | 'pm' | undefined) ?? null;
  const aMer = (a.match(am)?.[1].replace(/\./g, '').toLowerCase() as 'am' | 'pm' | undefined) ?? null;
  const aH = Number(a.match(/\d{1,2}/)?.[0]), bH = Number(b.match(/\d{1,2}/)?.[0]);
  // without markers, museum-style "10-6": the opening is in the morning (noon for 12), the closing in the afternoon or evening
  const close = clock(b, bMer ?? (bH === 12 ? 'am' : 'pm'));
  let open = clock(a, aMer ?? (aH === 12 ? 'pm' : bMer === 'pm' && aH < bH && aH < 7 ? 'pm' : 'am'));
  if (open === null || close === null) return null;
  const c = close === 0 ? 1440 : close; // "12 AM" closing = midnight
  if (c <= open) return null;
  return [open, c];
}
const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** "Nov 1, 2026-Mar 25, 2027" / "Mar 26-Nov 6, 2027" -> [from, to] */
function dates(s: string): [string, string] | null {
  const m = s.trim().match(/^([A-Za-z]{3,5})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*([A-Za-z]{3,5})\.?\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const m1 = MON[m[1].toLowerCase()], m2 = MON[m[4].toLowerCase()];
  if (!m1 || !m2) return null;
  const y2 = Number(m[6]); const y1 = m[3] ? Number(m[3]) : (m1 > m2 ? y2 - 1 : y2);
  return [iso(y1, m1, Number(m[2])), iso(y2, m2, Number(m[5]))];
}

/** one clause inside a segment: "Mon-Fri 10-5", "closed Mon-Tue", "Mon-Wed closed", "Wednesdays until 9", "last entry ..." */
function clause(c: string, seg: HoursSegment): boolean {
  const t = c.trim().replace(/\s*\((?:last entry|animal exhibits)[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!t || /^last entry\b/i.test(t)) return true;
  if (HOLIDAY.test(t) && (/^closed\b/i.test(t) || !/\d/.test(t))) return true; // holiday closures: not modeled, said on the page
  let m = t.match(/^closed\s+(.+)$/i) ?? t.match(/^(.+?)\s+closed$/i);
  if (m) { const d = days(m[1]); if (!d) return false; for (const x of d) seg.days[x] = 'closed'; return true; }
  m = t.match(/^(.+?)\s+until\s+(.+)$/i);
  if (m) {
    const d = days(m[1]); if (!d) return false;
    for (const x of d) { const cur = seg.days[x]; if (!Array.isArray(cur)) return false; const end = clock(m[2], /am/i.test(m[2]) ? 'am' : 'pm'); if (end === null || end <= cur[0]) return false; seg.days[x] = [cur[0], end]; }
    return true;
  }
  m = t.match(/^(.*?[a-z])\s+(\d.*)$/i);
  if (!m) return false;
  const d = days(m[1]); const h = times(m[2]);
  if (!d || !h) return false;
  for (const x of d) seg.days[x] = h;
  return true;
}

export function parseHours(text: string): HoursSegment[] | null {
  if (!text || VAGUE.test(text)) return null;
  const segs: HoursSegment[] = [];
  let cur: HoursSegment | null = null;
  for (const raw of text.split(/;\s*/)) {
    let part = raw.trim();
    if (!part) continue;
    // a season label opens a new segment: "Winter (Nov 1, 2026-Mar 25, 2027): ..." or "Nov 1, 2026-Mar 25, 2027: ..."
    const lab = part.match(/^(?:[A-Za-z ]+\(([^)]+)\)|([A-Za-z]{3,5}\.? \d[^:]*)):\s*(.*)$/);
    const r = lab ? dates(lab[1] ?? lab[2]) : null;
    if (lab && lab[1] && !r) return null; // a labeled season whose dates we cannot read
    if (lab && r) {
      cur = { from: r[0], to: r[1], days: {} };
      segs.push(cur);
      part = lab[3];
    } else if (/^[A-Za-z ]+:/.test(part)) return null; // "Museum: ...", "Memorial plaza: ...": two venues, two schedules
    if (!cur) { cur = { days: {} }; segs.push(cur); }
    // "closed Mon, Tue, Sat": a bare day name continues the clause before it
    const cl: string[] = [];
    for (const c of part.split(/,\s*(?=[A-Za-z])/)) { if (cl.length && /^[A-Za-z]+$/.test(c.trim()) && c.trim().toLowerCase() in DAY) cl[cl.length - 1] += `, ${c}`; else cl.push(c); }
    for (const c of cl) if (!clause(c, cur)) return null;
  }
  const useful = segs.filter((s) => Object.values(s.days).some(Array.isArray));
  return useful.length === segs.length && segs.length ? segs : null;
}
