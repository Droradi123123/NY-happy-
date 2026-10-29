/**
 * The explorer: filters + list + map for happy hours and parties, in the browser.
 *
 * Markup comes from components/Explorer.astro (filter controls carry data-f / data-v).
 * Rows come from /data/bars.json or /data/parties.json (lib/index.ts). The filter state
 * lives in the URL (?day=fri&hood=williamsburg...), so every view can be shared and the
 * back button works. MapLibre loads only when the map is first shown.
 */
type Row = Record<string, any>;
type Kind = 'bars' | 'parties';

const NY = 'America/New_York';
const PAGE = 24;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** New York weekday (0 = Monday) and minutes since midnight */
export function nyNow(d = new Date()): { day: number; min: number; date: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { day, min: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}
const ampm = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`; };

/** is a bar's happy hour on at (day, minute)? returns the end minute, or null */
export function hhAt(r: Row, day: number, m: number): number | null {
  for (const [days, s0, e0] of r.w as [number[], number | null, number | null][]) {
    const s = s0 ?? 11 * 60, e = e0 ?? 24 * 60;
    if (e > s) { if (days.includes(day) && m >= s && m < e) return e; }
    else { // past midnight
      if (days.includes(day) && m >= s) return e + 1440;
      if (days.includes((day + 6) % 7) && m < e) return e;
    }
  }
  return null;
}
const hhOnDay = (r: Row, day: number) => (r.w as [number[]][]).some(([days]) => days.includes(day));

function distance(a: [number, number], b: [number, number]) {
  const R = 6371000, k = Math.PI / 180, dLa = (b[0] - a[0]) * k, dLo = (b[1] - a[1]) * k;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const miles = (m: number) => (m < 160 ? `${Math.round(m * 3.28 / 10) * 10} ft` : `${(m / 1609).toFixed(1)} mi`);

const LINE: Record<string, [string, string]> = {};
for (const [lines, bg, fg] of [['123', '#EE352E', '#fff'], ['456', '#00933C', '#fff'], ['7', '#B933AD', '#fff'], ['ACE', '#0039A6', '#fff'], ['BDFM', '#FF6319', '#fff'], ['G', '#6CBE45', '#141414'], ['JZ', '#996633', '#fff'], ['L', '#A7A9AC', '#141414'], ['NQRW', '#FCCC0A', '#141414'], ['S', '#808183', '#fff']] as const)
  for (const l of lines) LINE[l] = [bg, fg];
const bullet = (l: string) => { const [bg, fg] = LINE[l] ?? ['#555', '#fff']; return `<span class="line" style="background:${bg};color:${fg}" aria-label="${esc(l)} train">${esc(l)}</span>`; };

// ---------- state ----------

interface State { [k: string]: string | string[] }
const MULTI = new Set(['tag', 'line', 'genre', 'bo', 'th']);

function readState(preset: State): State {
  const q = new URLSearchParams(location.search);
  const st: State = { ...preset };
  q.forEach((v, k) => { st[k] = MULTI.has(k) ? v.split(',').filter(Boolean) : v; });
  return st;
}
function writeState(st: State, preset: State) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(st)) {
    if (JSON.stringify(v) === JSON.stringify(preset[k])) continue;
    const s = Array.isArray(v) ? v.join(',') : v;
    if (s) q.set(k, s);
  }
  const url = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
  history.replaceState(null, '', url);
}

// ---------- filtering ----------

export function filterBars(rows: Row[], st: State, here: [number, number] | null) {
  const now = nyNow();
  const q = String(st.q ?? '').trim().toLowerCase();
  const day = st.day === 'today' || st.day === 'now' ? now.day : st.day ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(String(st.day)) : -1;
  const at = st.day === 'now' ? now.min : st.time ? Number(st.time) : null;
  const tags = st.tag as string[] ?? [], lines = st.line as string[] ?? [], boroughs = st.bo as string[] ?? [];
  const max = st.max ? Number(st.max) : null;
  const out: Row[] = [];
  for (const r of rows) {
    if (q && !`${r.n} ${r.hn} ${r.st ?? ''}`.toLowerCase().includes(q)) continue;
    if (st.hood && r.h !== st.hood) continue;
    if (boroughs.length && !boroughs.includes(r.bo)) continue;
    if (lines.length && !lines.some((l) => r.ln.includes(l))) continue;
    if (tags.length && !tags.every((t) => r.f.includes(t))) continue;
    if (st.book === '1' && !r.bk) continue;
    if (max !== null && (r.c === null || r.c > max)) continue;
    let until: number | null = null;
    if (day >= 0) {
      if (at !== null) { until = hhAt(r, day, at); if (until === null) continue; }
      else if (!hhOnDay(r, day)) continue;
    }
    const dist = here && r.la !== null ? distance(here, [r.la, r.lo]) : null;
    if (here && st.near && (dist === null || dist > Number(st.near))) continue;
    out.push({ ...r, _until: until, _dist: dist });
  }
  const sort = String(st.sort || (here ? 'near' : st.day === 'now' ? 'ending' : 'best'));
  // the best order puts the happy hours that run today first
  const todayFirst = (r: Row) => (hhOnDay(r, now.day) ? 0 : 1);
  out.sort((a, b) =>
    sort === 'near' ? (a._dist ?? 1e9) - (b._dist ?? 1e9)
    : sort === 'cheap' ? (a.c ?? 99) - (b.c ?? 99)
    : sort === 'ending' ? (a._until ?? 9e9) - (b._until ?? 9e9)
    // today first, then the server's order (lib/lists.ts rank): deal listed and read in the last 30 days first, then
    // cheapest drink, most recently checked, name
    : todayFirst(a) - todayFirst(b) || tier(a) - tier(b) || (a.c ?? 99) - (b.c ?? 99) || (b.ck ?? '').localeCompare(a.ck ?? '') || a.n.localeCompare(b.n));
  return out;
}

const freshSince = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
const tier = (r: Row) => (r.f.includes('deal') ? 0 : 2) + ((r.ck ?? '') >= freshSince ? 0 : 1);

function inWindow(r: Row, when: string) {
  const now = nyNow();
  const today = now.date;
  const add = (n: number) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  if (!when || when === 'all') return true;
  if (when === 'tonight') return r.nd === today || (r.nd === add(-1) && now.min < 6 * 60);
  if (when === 'tomorrow') return r.nd === add(1);
  if (when === 'weekend') { const dow = now.day; const fri = add((4 - dow + 7) % 7); const sun = add((6 - dow + 7) % 7); return r.nd >= (dow >= 4 ? today : fri) && r.nd <= sun; }
  if (when === 'week') return r.nd >= today && r.nd <= add(7);
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return r.nd === when;
  return true;
}
export function filterParties(rows: Row[], st: State, here: [number, number] | null) {
  const q = String(st.q ?? '').trim().toLowerCase();
  const genres = st.genre as string[] ?? [], tags = st.tag as string[] ?? [], boroughs = st.bo as string[] ?? [], themes = st.th as string[] ?? [];
  const max = st.max ? Number(st.max) : null;
  const out: Row[] = [];
  const nowMs = Date.now();
  for (const r of rows) {
    // a night that is over leaves every list at once, without waiting for the next rebuild
    if ((r.en ? Date.parse(r.en) : Date.parse(r.st) + 6 * 3600e3) < nowMs) continue;
    if (q && !`${r.t} ${r.vn} ${r.h ?? ''}`.toLowerCase().includes(q)) continue;
    if (!inWindow(r, String(st.when ?? ''))) continue;
    if (st.venue && r.v !== st.venue) continue;
    if (st.hood && (r.h ?? '').toLowerCase() !== String(st.hood).toLowerCase()) continue;
    if (boroughs.length && !boroughs.includes(r.bo)) continue;
    if (genres.length && !genres.some((g) => r.g.includes(g))) continue;
    if (themes.length && !themes.some((t) => r.th.includes(t))) continue;
    if (tags.length && !tags.every((t) => r.tg.includes(t))) continue;
    if (max !== null && (r.p === null || r.p > max)) continue;
    if (st.age === '1' && (r.a ?? 21) > 18) continue;
    if (st.avail === '1' && r.so) continue;
    const dist = here && r.la !== null ? distance(here, [r.la, r.lo]) : null;
    out.push({ ...r, _dist: dist });
  }
  const sort = String(st.sort || 'date');
  out.sort((a, b) => sort === 'cheap' ? (a.p ?? 999) - (b.p ?? 999) : sort === 'near' ? (a._dist ?? 1e9) - (b._dist ?? 1e9) : a.st.localeCompare(b.st));
  return out;
}

// ---------- rendering ----------

const boro = (b: string | null) => (b ? b.toLowerCase().replace(/^the /, '').replace(/\s+/g, '-') : 'nyc');
const thumb = (r: Row) => (r.im
  ? `<figure class="xcard-img"><img src="${esc(r.im[0])}" alt="" width="500" height="281" loading="lazy" decoding="async"><figcaption>${esc(r.im[1])}</figcaption></figure>`
  : `<div class="xcard-art xart-${boro(r.bo)}" aria-hidden="true"><span>${esc(r.vn || r.hn || 'NYC')}</span></div>`);
export function barCard(r: Row, st: State) {
  const now = st.day === 'now';
  const live = now && r._until !== null ? `<span class="chip badge-live">Happy hour now · until ${ampm(r._until % 1440)}</span>` : '';
  const sub = r.st ? `<span class="sub">${r.ln.map(bullet).join('')} ${esc(r.st)}${r.wm ? ` · ${r.wm} min walk` : ''}</span>` : '';
  const deal = r.d ? `<p class="deal">${esc(r.d)}</p>` : `<p class="deal muted">Times published, deal not listed</p>`;
  const dist = r._dist !== null && r._dist !== undefined ? `<span class="dist">${miles(r._dist)}</span>` : '';
  return `<article class="xcard">${thumb(r)}<div class="xcard-top"><h3><a href="/bars/${esc(r.s)}">${esc(r.n)}</a></h3>${dist}</div>
  <p class="where">${esc(r.hn)}${r.bo && r.bo !== r.hn ? `, ${esc(r.bo)}` : ''}</p>${deal}<p class="sch">${esc(r.sch)}</p>
  <div class="xcard-foot">${live}${sub}</div>${r.ck ? `<p class="checked">Checked ${new Date(r.ck + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>` : ''}<p class="xcard-cta" aria-hidden="true">See the deal <span>→</span></p></article>`;
}
export function partyCard(r: Row) {
  const date = new Date(`${r.nd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const genres = r.g.slice(0, 3).map((g: string) => `<span class="chip">${esc(g.replace(/-/g, ' '))}</span>`).join('');
  const dist = r._dist !== null && r._dist !== undefined ? `<span class="dist">${miles(r._dist)}</span>` : '';
  const end = r.en ?? new Date(Date.parse(r.st) + 6 * 3600e3).toISOString();
  return `<article class="xcard party" data-end="${esc(end)}">${thumb(r)}<div class="xcard-top"><p class="when">${esc(date)}${r.tm ? ` · ${esc(r.tm)}` : ''}</p>${dist}</div>
  <h3><a href="/parties/${esc(r.s)}">${esc(r.t)}</a></h3><p class="where">${esc(r.vn)}${r.h ? ` · ${esc(r.h)}` : ''}</p>
  <div class="xcard-foot">${r.so ? '<span class="chip dark">Sold out</span>' : `<span class="chip outline">${esc(r.pl)}</span>`}${r.a ? `<span class="chip outline">${r.a}+</span>` : ''}${genres}</div><p class="xcard-cta" aria-hidden="true">${r.so ? 'Details' : 'Tickets and details'} <span>→</span></p></article>`;
}

// ---------- map ----------

async function makeMap(el: HTMLElement, kind: Kind) {
  const maplibregl = (await import('maplibre-gl')).default;
  await (await import('./maplibre-css')).mapCss();
  const fun = await import('./mapfun');
  const map = new maplibregl.Map({
    container: el, style: fun.STYLE, center: [-73.97, 40.73], zoom: 11.2,
    attributionControl: { compact: true }, cooperativeGestures: matchMedia('(pointer: coarse)').matches,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
  await new Promise((r) => map.on('load', r));
  el.classList.add('map-live');
  fun.warmUp(map); fun.addPins(map);
  const cp = fun.clusterPaint(kind === 'parties' ? '#FF4F64' : '#5B2EE8');
  map.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 14 });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'pts', filter: ['has', 'point_count'], paint: cp.circle as any });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'pts', filter: ['has', 'point_count'], layout: cp.count.layout as any, paint: cp.count.paint });
  // one emoji pin per place: 🍹 green when the happy hour is on right now
  map.addLayer({ id: 'pt', type: 'symbol', source: 'pts', filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': ['case', ['get', 'live'], 'pin-live', kind === 'parties' ? 'pin-party' : 'pin-bar'], 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 1.1] } });
  map.on('click', 'clusters', async (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
    const z = await (map.getSource('pts') as any).getClusterExpansionZoom(f.properties!.cluster_id);
    map.easeTo({ center: (f.geometry as any).coordinates, zoom: z });
  });
  map.on('click', 'pt', (e) => {
    const p = e.features![0].properties as Record<string, string>;
    new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setLngLat((e.features![0].geometry as any).coordinates)
      .setHTML(`<a class="pop-title" href="${esc(p.url)}">${esc(p.name)}</a><p class="pop-line">${esc(p.l1)}</p><p class="pop-line muted">${esc(p.l2)}</p>`).addTo(map);
  });
  for (const l of ['clusters', 'pt']) { map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer')); map.on('mouseleave', l, () => (map.getCanvas().style.cursor = '')); }
  return map;
}
function features(rows: Row[], kind: Kind) {
  return {
    type: 'FeatureCollection', features: rows.filter((r) => r.la !== null).map((r) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [r.lo, r.la] },
      properties: kind === 'bars'
        ? { name: r.n, url: `/bars/${r.s}`, l1: r.d ?? 'Deal not listed', l2: r.sch, live: r._until !== null && r._until !== undefined }
        : { name: r.t, url: `/parties/${r.s}`, l1: `${new Date(`${r.nd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${r.tm ? ` · ${r.tm}` : ''}`, l2: `${r.vn} · ${r.pl}`, live: false },
    })),
  };
}

// ---------- wiring ----------

export async function initExplorer(root: HTMLElement) {
  const kind = root.dataset.kind as Kind;
  const preset: State = JSON.parse(root.dataset.preset || '{}');
  let st = readState(preset);
  let here: [number, number] | null = null;
  let shown = PAGE;
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const more = root.querySelector<HTMLButtonElement>('[data-more]')!;
  const mapEl = root.querySelector<HTMLElement>('[data-map]');
  let map: any = null, mapLoading = false, last: Row[] = [];

  const rows: Row[] = await fetch(root.dataset.src!).then((r) => r.json());

  function syncControls() {
    root.querySelectorAll<HTMLElement>('[data-f]').forEach((el) => {
      const k = el.dataset.f!, v = el.dataset.v ?? '';
      const cur = st[k];
      if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) { if (el.type !== 'checkbox') el.value = String(cur ?? ''); else el.checked = cur === '1'; return; }
      const on = Array.isArray(cur) ? cur.includes(v) : String(cur ?? '') === v && (v !== '' || k === 'sort');
      el.setAttribute('aria-pressed', String(on));
    });
  }
  async function ensureMap() {
    if (map || mapLoading || !mapEl || mapEl.offsetParent === null) return;
    mapLoading = true;
    map = await makeMap(mapEl, kind);
    map.getSource('pts').setData(features(last, kind));
    fit();
  }
  function fit() {
    if (!map) return;
    const pts = last.filter((r) => r.la !== null);
    if (!pts.length) return;
    const lo = pts.map((r) => r.lo), la = pts.map((r) => r.la);
    map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 48, maxZoom: 15, duration: 400 });
  }
  let firstRender = true;
  function render(resetPage = true) {
    if (resetPage) shown = PAGE;
    last = kind === 'bars' ? filterBars(rows, st, here) : filterParties(rows, st, here);
    const noun = kind === 'bars' ? (last.length === 1 ? 'happy hour' : 'happy hours') : last.length === 1 ? 'party' : 'parties';
    count.textContent = `${last.length.toLocaleString('en-US')} ${noun}`;
    // each pill shows how many of its filters the visitor set (page presets do not count); sort shows its choice
    const set = (k: string) => { const v = st[k]; return JSON.stringify(v) === JSON.stringify(preset[k]) ? 0 : Array.isArray(v) ? v.length : v ? 1 : 0; };
    let active = 0;
    root.querySelectorAll<HTMLElement>('.xpill[data-keys]').forEach((p) => {
      const keys = p.dataset.keys!.split(',');
      const n = keys.reduce((s, k) => s + set(k), 0);
      const pc = p.querySelector<HTMLElement>('.pc')!;
      if (keys[0] === 'sort') {
        const label = n ? root.querySelector<HTMLElement>(`[data-f="sort"][data-v="${CSS.escape(String(st.sort))}"]`)?.textContent : '';
        pc.hidden = !label; pc.textContent = label ?? ''; pc.classList.toggle('word', !!label);
      } else { active += n; pc.hidden = n === 0; pc.textContent = String(n); }
      p.classList.toggle('on', n > 0);
    });
    const clear = root.querySelector<HTMLElement>('.xclear');
    if (clear) clear.hidden = active === 0 && !here;
    // first paint: when the server-rendered cards are exactly what the filters give, they stay
    // (their photos are the page's largest paint; replacing them would fetch it all again)
    const want = last.slice(0, shown).map((r) => `/${kind === 'bars' ? 'bars' : 'parties'}/${r.s}`);
    const have = [...list.querySelectorAll<HTMLAnchorElement>('.xcard h3 a')].map((a) => a.getAttribute('href'));
    const keepServer = firstRender && have.length > 0 && have.length === want.length && have.every((h, i) => h === want[i]);
    firstRender = false;
    if (!keepServer) list.innerHTML = last.length
      ? last.slice(0, shown).map((r) => (kind === 'bars' ? barCard(r, st) : partyCard(r))).join('')
      : `<p class="empty">Nothing matches all of these filters. <button type="button" class="linkbtn" data-reset>Clear filters</button></p>`;
    more.hidden = last.length <= shown;
    more.textContent = `Show more (${(last.length - shown).toLocaleString('en-US')})`;
    if (map) { map.getSource('pts').setData(features(last, kind)); fit(); }
    syncControls();
    writeState(st, preset);
  }

  // filter panels: one open at a time, under its pill (a bottom sheet on phones)
  let scrim: HTMLElement | null = null;
  function closePop() {
    root.querySelectorAll<HTMLElement>('.pop:not([hidden])').forEach((p) => (p.hidden = true));
    root.querySelectorAll('.xpill[aria-expanded="true"]').forEach((p) => p.setAttribute('aria-expanded', 'false'));
    scrim?.remove(); scrim = null;
  }
  function openPop(pill: HTMLElement) {
    const panel = root.querySelector<HTMLElement>(`.pop[data-panel="${pill.dataset.pop}"]`);
    if (!panel) return;
    closePop();
    panel.hidden = false;
    pill.setAttribute('aria-expanded', 'true');
    const wrap = panel.parentElement!.getBoundingClientRect(), r = pill.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(r.left - wrap.left, wrap.width - panel.offsetWidth))}px`;
    if (matchMedia('(max-width: 719px)').matches) {
      scrim = document.createElement('div');
      scrim.className = 'ex-scrim';
      scrim.addEventListener('click', closePop);
      panel.before(scrim);
    }
    panel.querySelector<HTMLElement>('button, select, input')?.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    if (!root.querySelector('.pop:not([hidden])')) return;
    const t = e.target as HTMLElement;
    if (!t.isConnected || t.closest('.pop, .xpill')) return;
    closePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !root.querySelector('.pop:not([hidden])')) return;
    const pill = root.querySelector<HTMLElement>('.xpill[aria-expanded="true"]');
    closePop(); pill?.focus();
  });

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pill = t.closest<HTMLElement>('.xpill[data-pop]');
    if (pill) { pill.getAttribute('aria-expanded') === 'true' ? closePop() : openPop(pill); return; }
    if (t.closest('[data-done]')) { closePop(); return; }
    const clr = t.closest<HTMLElement>('[data-clear]');
    if (clr) { for (const k of clr.dataset.clear!.split(',')) st[k] = preset[k] ?? (MULTI.has(k) ? [] : ''); render(); return; }
    const btn = t.closest<HTMLElement>('button[data-f]');
    if (btn) {
      const k = btn.dataset.f!, v = btn.dataset.v ?? '';
      if (MULTI.has(k)) { const cur = new Set((st[k] as string[]) ?? []); cur.has(v) ? cur.delete(v) : cur.add(v); st[k] = [...cur]; }
      else st[k] = st[k] === v ? '' : v;
      if (k === 'day' && st.day !== 'now' && st.time === undefined) st.time = '';
      if (k === 'sort') { st.sort = v; closePop(); }
      render();
      // which filters people use, and whether they leave them with something to choose from
      (window as any).gtag?.('event', 'filter_use', { list: kind, filter: k, value: v, results: last.length, page: location.pathname });
      return;
    }
    if (t.closest('[data-reset]')) {
      st = { ...preset }; here = null; closePop();
      const near = root.querySelector<HTMLElement>('[data-near]'); if (near) { near.textContent = '📍 Near me'; near.classList.remove('on'); }
      render(); return;
    }
    if (t.closest('[data-more]')) { shown += PAGE; render(false); return; }
    if (t.closest('[data-near]')) {
      const b = t.closest<HTMLButtonElement>('[data-near]')!;
      b.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(
        (p) => { here = [p.coords.latitude, p.coords.longitude]; st.sort = 'near'; b.textContent = '📍 Near me ✓'; b.classList.add('on'); render(); },
        () => { b.textContent = 'Location blocked'; },
        { enableHighAccuracy: true, timeout: 10000 });
      return;
    }
    const view = t.closest<HTMLElement>('[data-view]');
    if (view) {
      root.dataset.mode = view.dataset.view!;
      root.querySelectorAll('[data-view]').forEach((v) => v.setAttribute('aria-pressed', String(v === view)));
      setTimeout(() => { ensureMap(); map?.resize(); }, 30);
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.dataset.f) return;
    st[el.dataset.f] = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    render();
  });
  let timer: number | undefined;
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.f !== 'q') return;
    clearTimeout(timer);
    timer = window.setTimeout(() => { st.q = el.value; render(); }, 180);
  });

  render();
  if (mapEl) {
    new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && ensureMap(), { rootMargin: '200px' }).observe(mapEl);
  }
  root.classList.add('ready');
}
