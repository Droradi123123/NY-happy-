/**
 * Reads a happy hour out of page text (rendered HTML, a PDF menu, or OCR of a menu image) for
 * deal-extract.mjs. It never decides what gets published: it cuts out the happy-hour block verbatim,
 * and suggests item/price pairs, the window and the days found in that block, so a reviewer can check
 * each one against the quoted text. Anything it cannot pair on the same line is left as loose prices.
 */

const ENT = { amp: '&', nbsp: ' ', eacute: 'é', egrave: 'è', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', quot: '"', copy: '©', hellip: '…' };
export const clean = (t) => String(t ?? '')
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
  .replace(/[​­]/g, '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ');

const ANCHOR = /happy\s*-?\s*hours?|\bhh\b|aperitivo|apéritif|aperitif/i;
// a block ends at the next part of the menu, or at the page furniture
const STOP = /\b(brunch menu|dinner menu|lunch menu|dessert menu|desserts|kids menu|private events?|gift cards?|reservations?|reserve (?:a|your)|order online|online ordering|copyright|all rights reserved|follow us|newsletter|subscribe|privacy policy)\b|©/i;
const MAX_BLOCK = 900;

/** The happy-hour passages of a page, verbatim, longest-first, at most 3. */
export function hhBlocks(raw) {
  const text = clean(raw);
  const out = [];
  for (const m of text.matchAll(new RegExp(ANCHOR.source, 'gi'))) {
    if (out.some((b) => m.index >= b.from && m.index < b.to)) continue;
    const from = Math.max(0, text.lastIndexOf('\n', m.index) + 1, m.index - 120);
    let to = Math.min(text.length, m.index + MAX_BLOCK);
    const skip = m.index + m[0].length + 8;
    const stop = STOP.exec(text.slice(skip, to));
    if (stop) to = skip + stop.index;
    const body = text.slice(from, to).trim();
    // a nav link or a heading on its own is not a block: it needs a time or a price
    if (/\d/.test(body) && (PRICE.test(body) || WINDOW.test(body))) out.push({ from, to, text: body });
  }
  return out.sort((a, b) => score(b.text) - score(a.text)).slice(0, 3).map((b) => b.text);
}
const score = (t) => (t.match(/\$\s?\d/g)?.length ?? 0) * 2 + (WINDOW.test(t) ? 3 : 0) + (DAYS_RE.test(t) ? 1 : 0);

// ---- prices -----------------------------------------------------------------------------------
const PRICE = /\$\s?(\d{1,3}(?:\.\d{2})?)(?![\d.,]\d)/;
const PRICE_G = /\$\s?(\d{1,3}(?:\.\d{2})?)(?![\d.,]\d)/g;
const PCT = /(\d{2})\s?%\s*off/i;
const BOGO = /\b2\s*(?:-|for|x)\s*1\b|two\s*for\s*one|buy one,? get one|\bbogo\b/i;
const DRINK = /\b(beers?|drafts?|draughts?|pints?|lagers?|ipas?|ales?|cans?|bottles?|wines?|glass(?:es)?|ros[ée]|prosecco|cava|champagne|bubbles|sangria|cocktails?|margaritas?|martinis?|spritz(?:es)?|negronis?|mojitos?|palomas?|mimosas?|bellinis?|well(?: drinks?)?|shots?|highballs?|mules?|old fashioned|manhattans?|whiske?y|bourbon|tequila|mezcal|vodka|gin|rum|sake|soju|hard seltzers?|seltzers?|ciders?|micheladas?|frozen|drinks?|house (?:red|white))\b/i;
const FOOD = /\b(oysters?|clams?|wings?|tacos?|fries|sliders?|burgers?|pizzas?|flatbreads?|nachos?|quesadillas?|empanadas?|dumplings?|bao|sushi|rolls?|maki|edamame|gyoza|calamari|meatballs?|bruschetta|crostini|olives|cheese|charcuterie|plates?|bites?|snacks?|apps?|appetizers?|small plates|shrimp|ceviche|hummus|dips?|spreads?|salads?|soups?|pretzels?|tots|croquettes?|arancini|skewers?|yakitori|kebabs?|souvlaki|hot dogs?|chips|guac(?:amole)?|elote|mussels|ribs|food)\b/i;
export const kindOf = (item) => (DRINK.test(item) ? 'drink' : FOOD.test(item) ? 'food' : 'unknown');

const FILLER = /^(?:only|just|for|all|each|ea|are|is|at|from|starting at|half off|our)\b\s*|\s*\b(?:only|each|ea|for|are|is|at|\/\s*each)\s*$/gi;
const TIME_PHRASE = /\b(?:from\s+)?(?:\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?\s*(?:-|–|—|to|until|till)\s*)?\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?m\.?|\b(?:’til|'til|until|till)\b|\b(?:daily|all day(?: long)?|every ?day)\b/gi;
const tidy = (s) => {
  let t = s.replace(/^.*:\s/, '').replace(TIME_PHRASE, ' ').replace(/[|•·*~_]+/g, ' ').replace(/\s*[-–—:.…]+\s*$/, '').replace(/^\s*[-–—:.…]+\s*/, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) t = t.replace(FILLER, '').trim();
  return t;
};

/**
 * Item/price pairs from a block. A "segment" is a line, or a run of text between list separators;
 * a pair is accepted only when the segment holds exactly one price and some words next to it.
 */
export function offersIn(block) {
  const segs = clean(block).split(/\n|\s[|•·]\s|\s{2,}|;\s|\*{2,}|[!?]\s+|\.\s+(?=[A-Z])|(?<=\d)\s*,\s+(?=[A-Za-z])|\s[—–]\s(?=\$)/).map((s) => s.trim()).filter(Boolean);
  const offers = [], loose = [];
  for (const seg of segs) {
    const ps = [...seg.matchAll(PRICE_G)];
    if (!ps.length) continue;
    if (ps.length > 1) { loose.push(...ps.map((p) => `$${p[1]}`)); continue; }
    const p = ps[0];
    // "$2 off any beer": a discount, not a price
    const off = /^\s*off\b/i.exec(seg.slice(p.index + p[0].length));
    if (off) {
      const item = tidy(seg.slice(p.index + p[0].length + off[0].length).replace(/^\s*(?:any|all|every)\b/i, ''));
      if (/[a-z]{3}/i.test(item)) { offers.push({ item, price: `$${Number(p[1])} off`, kind: kindOf(item), line: seg.slice(0, 160) }); continue; }
    }
    const before = tidy(seg.slice(0, p.index)), after = tidy(seg.slice(p.index + p[0].length).replace(/^\s*(?:ea\.?|each|\/\s*each|pp)\b/i, ''));
    // "Draft Beer $6" (item first) or "$6 Draft Beer" (price first); the side with drink or food words wins
    const pick = [before, after].filter((s) => /[a-z]{3}/i.test(s) && s.length <= 70)
      .sort((a, b) => Number(kindOf(b) !== 'unknown') - Number(kindOf(a) !== 'unknown') || a.length - b.length)[0];
    if (!pick || ANCHOR.test(pick) && pick.replace(ANCHOR, '').trim().length < 3) { loose.push(`$${p[1]}`); continue; }
    offers.push({ item: pick.replace(new RegExp(ANCHOR.source, 'gi'), '').replace(/\s+/g, ' ').trim() || pick, price: `$${Number(p[1])}`, kind: kindOf(pick), line: seg.slice(0, 160) });
  }
  return { offers: dedupe(offers), loose: [...new Set(loose)] };
}
const dedupe = (os) => os.filter((o, i) => os.findIndex((x) => x.item.toLowerCase() === o.item.toLowerCase() && x.price === o.price) === i);

// ---- window and days ---------------------------------------------------------------------------
const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?(?:\s*([ap])\.?\s?m\b\.?)?`;
const WINDOW = new RegExp(String.raw`\b${T}\s*(?:-|–|—|to|until|till|’til|'til)\s*${T}(?![\d%])`, 'i');
const UNTIL = new RegExp(String.raw`(?:open|opening)?\s*(?:until|till|’til|'til|to)\s*${T}`, 'i');
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${m ?? '00'}`;
const to24 = (h, ap) => { h = Number(h); const pm = String(ap).toLowerCase() === 'p'; return h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h; };

/** The first happy-hour window in a block, as 24h "HH:MM" strings, with the quoted text. */
export function windowIn(block) {
  const t = clean(block);
  const m = WINDOW.exec(t);
  if (m) {
    const [, h1, m1, a1, h2, m2, a2] = m;
    if (!a1 && !a2 && !/[:.]/.test(m[0])) {
      // "4-7" with no am/pm: only read as afternoon when it looks like one (both hours 1-11, end later)
      if (!(Number(h1) >= 1 && Number(h1) < Number(h2) && Number(h2) <= 11 && /pm|p\.m\./i.test(t.slice(m.index, m.index + 40)))) return null;
    }
    // "4-7pm": the start takes the end's am/pm unless that puts it after the end ("11-2pm" is 11am)
    const ap2 = (a2 ?? 'p').toLowerCase();
    const end = to24(h2, ap2);
    let start = to24(h1, a1 ?? ap2);
    if (!a1 && start > end) start = to24(h1, ap2 === 'p' ? 'a' : 'p');
    if (Number(h1) > 12 || Number(h2) > 12 && (a1 || a2) || start === end) return null;
    return { start: hhmm(start, m1), end: hhmm(end % 24, m2), quote: m[0].trim() };
  }
  const u = UNTIL.exec(t);
  if (u && u[3]) return { start: null, end: hhmm(to24(u[1], u[3]) % 24, u[2]), quote: u[0].trim() };
  return null;
}

const DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_W = String.raw`(mon|tue|wed|thu|fri|sat|sun)(?:day|s|\.|nesday|sday|rsday|urday|n)?`;
const RANGE = new RegExp(String.raw`\b${DAY_W}\s*(?:-|–|—|to|through|thru)\s*${DAY_W}\b`, 'i');
const DAYS_RE = new RegExp(String.raw`\b(daily|every\s*day|7 days|seven days|weekdays|${DAY_W})\b`, 'i');

/** The days named in a block, or null when it names none. */
export function daysIn(block) {
  const t = clean(block).toLowerCase();
  if (/\b(daily|every\s*day|7 days a week|seven days)\b/.test(t)) return [...DAY];
  const r = RANGE.exec(t);
  if (r) {
    const a = DAY.indexOf(r[1].slice(0, 3)), b = DAY.indexOf(r[2].slice(0, 3));
    const out = [];
    for (let i = a; ; i = (i + 1) % 7) { out.push(DAY[i]); if (i === b || out.length > 7) break; }
    return out;
  }
  if (/\bweekdays\b/.test(t)) return DAY.slice(0, 5);
  const named = [...new Set([...t.matchAll(new RegExp(String.raw`\b${DAY_W}\b`, 'g'))].map((m) => m[1].slice(0, 3)))];
  return named.length ? DAY.filter((d) => named.includes(d)) : null;
}

/** Everything a reviewer needs from one page's text. */
export function readDeal(text) {
  const blocks = hhBlocks(text);
  if (!blocks.length) return null;
  const main = blocks[0];
  const { offers, loose } = offersIn(main);
  return {
    block: main.slice(0, MAX_BLOCK),
    offers, loose,
    window: windowIn(main),
    days: daysIn(main),
    discount_pct: PCT.exec(main)?.[1] ? Number(PCT.exec(main)[1]) : null,
    two_for_one: BOGO.test(main),
    other_blocks: blocks.slice(1).map((b) => b.slice(0, 400)),
  };
}
