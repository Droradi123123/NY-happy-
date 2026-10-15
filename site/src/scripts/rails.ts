/**
 * Home rails: a row of filter chips over a sideways-scrolling row of cards. The chips are plain
 * links in the HTML (they work without JS and pass link equity); here they filter in place from
 * /data/bars.json or /data/parties.json, with live counts, and "On now" uses New York time.
 */
import { filterBars, filterParties, barCard, partyCard, nyNow } from './explorer';

type Row = Record<string, any>;
interface Chip { id: string; label: string; href: string; st?: Record<string, any>; run?: (rows: Row[]) => Row[] }
const MAX = 14;

/** happy hours that have not started yet today, soonest first */
function later(rows: Row[]) {
  const { day, min } = nyNow();
  const out: Row[] = [];
  for (const r of rows) {
    let next: number | null = null;
    for (const [days, s] of r.w as [number[], number | null][]) if (days.includes(day) && s !== null && s > min && (next === null || s < next)) next = s;
    if (next !== null) out.push({ ...r, _start: next, _until: null, _dist: null });
  }
  return out.sort((a, b) => a._start - b._start);
}
const startLabel = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`; };

function barChips(): Chip[] {
  return [
    { id: 'now', label: 'On now', href: '/happy-hours/now', st: { day: 'now' } },
    { id: 'later', label: 'Later today', href: '/happy-hours?day=today', run: later },
    { id: 'cheap', label: 'Drinks $6 and under', href: '/happy-hours/cheap-drinks', st: { max: '6', sort: 'cheap' } },
    { id: 'rooftop', label: 'Rooftops', href: '/happy-hours/rooftop', st: { tag: ['rooftop'] } },
    { id: 'food', label: 'Food deals', href: '/happy-hours/food', st: { tag: ['food'] } },
    { id: 'oysters', label: 'Oysters', href: '/happy-hours/oysters', st: { tag: ['oysters'] } },
    { id: 'late', label: 'Late night', href: '/happy-hours/late-night', st: { tag: ['late'] } },
    { id: 'brooklyn', label: 'Brooklyn', href: '/happy-hours/brooklyn', st: { bo: ['Brooklyn'] } },
    { id: 'queens', label: 'Queens', href: '/happy-hours/queens', st: { bo: ['Queens'] } },
  ];
}
function partyChips(rows: Row[]): Chip[] {
  const genres = new Map<string, number>();
  for (const r of rows) for (const g of r.g as string[]) genres.set(g, (genres.get(g) ?? 0) + 1);
  const top = [...genres].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
  return [
    { id: 'tonight', label: 'Tonight', href: '/parties?when=tonight', st: { when: 'tonight' } },
    { id: 'weekend', label: 'This weekend', href: '/parties?when=weekend', st: { when: 'weekend' } },
    { id: 'halloween', label: 'Halloween', href: '/parties/halloween', st: { th: ['halloween'] } },
    { id: 'free', label: 'Free', href: '/parties?max=0', st: { max: '0' } },
    { id: 'lgbtq', label: 'LGBTQ+', href: '/parties?tag=lgbtq', st: { tag: ['lgbtq'] } },
    ...top.map((g) => ({ id: `g-${g}`, label: g.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), href: `/parties?genre=${g}`, st: { genre: [g] } })),
  ];
}

async function initRail(root: HTMLElement) {
  const kind = root.dataset.rail as 'bars' | 'parties';
  const track = root.querySelector<HTMLElement>('[data-track]')!;
  const chipsEl = root.querySelector<HTMLElement>('[data-chips]')!;
  const all = root.querySelector<HTMLAnchorElement>('[data-all]');
  const note = root.querySelector<HTMLElement>('[data-note]');
  // arrows scroll one screen of cards on wide screens
  root.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((b) => b.addEventListener('click', () =>
    track.scrollBy({ left: Number(b.dataset.dir) * track.clientWidth * 0.9, behavior: 'smooth' })));

  let rows: Row[];
  try { rows = await (await fetch(`/data/${kind}.json`)).json(); } catch { return; }
  // a chip whose list page this build does not have is left out
  const lists = new Set((root.dataset.lists ?? '').split(','));
  const chips = (kind === 'bars' ? barChips() : partyChips(rows))
    .filter((c) => !/^\/happy-hours\/[a-z0-9-]+$/.test(c.href) || c.href === '/happy-hours/now' || lists.has(c.href.split('/')[2]));
  const run = (c: Chip) => (c.run ? c.run(rows) : kind === 'bars' ? filterBars(rows, c.st!, null) : filterParties(rows, c.st!, null));
  // results are computed on demand and cached: the first view needs two or three chips, the
  // other counts fill in one per idle slot (no long main-thread task on a slow phone)
  const results = new Map<string, Row[]>();
  const res = (c: Chip) => { if (!results.has(c.id)) results.set(c.id, run(c)); return results.get(c.id)!; };
  const enough = (c: Chip) => res(c).length >= (c.id === 'now' || c.id === 'tonight' ? 1 : 3);
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50));

  const show = (c: Chip) => {
    const list = res(c);
    chipsEl.querySelectorAll('a').forEach((a) => a.dataset.chip === c.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
    const cards = list.slice(0, MAX).map((r) => {
      let html = kind === 'bars' ? barCard(r, c.st ?? {}) : partyCard(r);
      if (c.id === 'later') html = html.replace('<div class="xcard-foot">', `<div class="xcard-foot"><span class="chip badge-soon">Starts ${startLabel(r._start)}</span>`);
      return html;
    });
    const more = list.length > MAX ? `<a class="rail-more" href="${c.href}"><span>${list.length - MAX} more</span><b>See all →</b></a>` : '';
    track.innerHTML = cards.join('') + more;
    track.scrollLeft = 0;
    if (all) { all.href = c.href; all.textContent = `See all ${list.length} →`; }
    if (note) note.textContent = c.id === 'now' ? `${list.length} happy hours on right now, New York time.` : '';
  };
  // first view: what is on now, else what starts later today, else the first chip with results
  const by = (id: string) => chips.find((c) => c.id === id);
  const pick = (id: string, min: number) => { const c = by(id); return c && res(c).length >= min ? c : undefined; };
  const first = (kind === 'bars' ? pick('now', 4) ?? pick('later', 4) ?? pick('cheap', 3) : pick('tonight', 3) ?? pick('weekend', 3) ?? pick('halloween', 3)) ?? chips.find(enough);
  if (!first) return;
  // chips appear at once (counts known so far); the rest of the counts arrive in idle slots
  chipsEl.innerHTML = chips.map((c) => `<a href="${c.href}" data-chip="${c.id}"${results.has(c.id) && !enough(c) ? ' hidden' : ''}>${c.label}<span class="n">${results.has(c.id) ? res(c).length : ''}</span></a>`).join('');
  show(first);
  chipsEl.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-chip]');
    if (!a) return;
    e.preventDefault();
    show(chips.find((c) => c.id === a.dataset.chip)!);
    (window as any).gtag?.('event', 'home_chip', { rail: kind, chip: a.dataset.chip });
  });
  const pending = chips.filter((c) => !results.has(c.id));
  const next = () => {
    const c = pending.shift();
    if (!c) return;
    const a = chipsEl.querySelector<HTMLAnchorElement>(`a[data-chip="${c.id}"]`);
    if (a) { a.hidden = !enough(c); a.querySelector('.n')!.textContent = String(res(c).length); }
    idle(next);
  };
  idle(next);
}

// each rail starts when it comes near the screen (the party rail is far below the fold on phones)
const start = () => {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    initRail(e.target as HTMLElement);
  }), { rootMargin: '300px' });
  document.querySelectorAll<HTMLElement>('[data-rail]').forEach((el) => io.observe(el));
};
// after the page has loaded, so the JSON never competes with the hero photo for bandwidth
const go = () => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 300));
if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
