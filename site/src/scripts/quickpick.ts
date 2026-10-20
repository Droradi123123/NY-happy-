/**
 * Home "three taps" picker (components/QuickPick.astro). Filters /data/bars.json with the explorer's
 * filterBars, so a result here is a result on the full list, and shows the top 3. When fewer than 3
 * match it loosens one choice at a time (budget, then neighborhood to its borough, then any time
 * today) and says which one, so the visitor always gets something and knows why.
 */
import { filterBars, hhAt, nyNow } from './explorer';

type Row = Record<string, any>;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ampm = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`; };
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function init(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('form')!;
  const out = root.querySelector<HTMLElement>('[data-qp-out]')!;
  const nearBtn = root.querySelector<HTMLButtonElement>('[data-qp-near]');
  let rows: Row[] | null = null, here: [number, number] | null = null;

  // times already past today are not offered (Now covers them)
  const { min } = nyNow();
  root.querySelectorAll<HTMLInputElement>('input[name=time]').forEach((i) => { if (i.value !== 'now' && Number(i.value) + 60 <= min) i.closest('label')!.hidden = true; });
  if (nearBtn && 'geolocation' in navigator) nearBtn.hidden = false;

  const val = (n: string) => (form.querySelector<HTMLInputElement>(`input[name=${n}]:checked`)?.value ?? '');
  async function run(source: string) {
    rows ??= await fetch('/data/bars.json').then((r) => r.json()).catch(() => null);
    if (!rows) return;
    const time = val('time'), max = val('max');
    const sel = form.querySelector<HTMLSelectElement>('select[name=hood]')!;
    const hood = sel.value, bo = sel.selectedOptions[0]?.dataset.bo ?? '';
    // the explorer's "best match" order: a deal read in the last 30 days first, then cheapest drink
    const st = (o: Record<string, any>) => ({ day: o.time === 'now' ? 'now' : 'today', time: o.time === 'now' || !o.time ? '' : o.time, hood: o.hood ?? '', bo: o.bo ? [o.bo] : [], max: o.max ?? '', near: here ? (o.far ? '3200' : '1200') : '', sort: here ? 'near' : 'best' });
    const want: Record<string, any> = { time, hood: here ? '' : hood, max };
    // loosen as little as possible until there are 3: price, then distance or neighborhood (keeping
    // the price), then both, then the time
    const steps: Record<string, any>[] = [want];
    if (max) steps.push({ ...want, max: '' });
    if (here) steps.push({ ...want, far: true }, { ...want, far: true, max: '' });
    if (want.hood) steps.push({ ...want, hood: '', bo }, { ...want, hood: '', bo, max: '' });
    if (time) steps.push({ ...want, max: '', hood: '', bo: want.hood ? bo : '', far: true, time: '' });
    const loosened = (o: Record<string, any>) => [
      want.hood && !o.hood ? `elsewhere in ${bo}` : '', here && o.far ? 'up to 2 miles away' : '',
      want.max && !o.max ? 'at any price' : '', want.time && !o.time ? 'on at other times today' : '',
    ].filter(Boolean);
    // "today" with no time: only happy hours that have not ended yet
    const { day: today, min: nowMin } = nyNow();
    const notOver = (r: Row) => (r.w as [number[], number | null, number | null][]).some(([d, s0, e]) => d.includes(today) && (e === null || e > nowMin || (s0 !== null && e < s0)));
    let found: Row[] = [], used = want;
    for (const o of steps) {
      const r = filterBars(rows, st(o), here).filter((x) => o.time || notOver(x));
      if (r.length >= 3 || o === steps[steps.length - 1]) { found = r; used = o; break; }
    }
    const parts = loosened(used);
    const why = parts.length ? `Fewer than 3 match all your choices, so these are ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}` : '';
    const { day, min: now } = nyNow();
    const at = used.time === 'now' ? now : used.time ? Number(used.time) : null;
    const top = found.slice(0, 3);
    const item = (r: Row) => {
      const until = at !== null ? hhAt(r, day, at) : null;
      const on = until !== null ? `<span class="qp-on">${used.time === 'now' ? 'On now' : `On at ${ampm(at!)}`}, until ${ampm(until % 1440)}</span>` : esc(r.sch);
      const deal = r.d ? `<span class="qp-deal">${esc(r.d)}</span>` : `<span class="qp-deal none">Times published, deal not listed</span>`;
      const dist = r._dist != null ? ` · ${(r._dist / 1609).toFixed(1)} mi` : '';
      return `<li class="qp-row"><a href="/bars/${esc(r.s)}" data-ev="quickpick"><b>${esc(r.n)}</b><span class="qp-hood">${esc(r.hn)}${dist}</span>${deal}<span class="qp-meta">${on}${r.ck ? ` · checked ${short(r.ck)}` : ''}</span></a></li>`;
    };
    const q = new URLSearchParams({ day: used.time === 'now' ? 'now' : 'today' });
    if (used.time && used.time !== 'now') q.set('time', used.time);
    if (used.hood) q.set('hood', used.hood); else if (used.bo) q.set('bo', used.bo);
    if (used.max) q.set('max', used.max);
    if (here) q.set('sort', 'near');
    out.innerHTML = found.length
      ? `${why ? `<p class="qp-note">${esc(why[0].toUpperCase() + why.slice(1))}.</p>` : ''}<ol class="qp-list">${top.map(item).join('')}</ol>${found.length > 3 ? `<a class="qp-all" href="/happy-hours?${q}">See all ${found.length} →</a>` : ''}`
      : `<p class="qp-note">No happy hours left today. <a href="/happy-hours">See every happy hour by day</a>.</p>`;
    if (source !== 'auto') (window as any).gtag?.('event', 'quickpick', { when: time, where: here ? 'near' : hood || 'any', budget: max || 'any', results: found.length, loosened: why ? 'yes' : 'no' });
  }

  form.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('select') && here) { here = null; nearBtn?.setAttribute('aria-pressed', 'false'); }
    run('change');
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); run('submit'); });
  nearBtn?.addEventListener('click', () => {
    nearBtn.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      (p) => { here = [p.coords.latitude, p.coords.longitude]; nearBtn.textContent = 'Near me ✓'; nearBtn.setAttribute('aria-pressed', 'true'); run('near'); },
      () => { nearBtn.textContent = 'Location blocked'; },
      { enableHighAccuracy: true, timeout: 10000 });
  });
  // the first answer (now, anywhere, any price) shows once the section is near the screen
  new IntersectionObserver((es, io) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); run('auto'); } }, { rootMargin: '200px' }).observe(root);
}

const go = () => document.querySelectorAll<HTMLElement>('[data-qp]').forEach(init);
if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
