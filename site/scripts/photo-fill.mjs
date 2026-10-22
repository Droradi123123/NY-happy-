/**
 * Photo fill (GitHub Actions, run by hand): every bar and venue on the site gets a picture.
 *
 * For each bar or venue with no approved photo in site_images, asks Wikimedia Commons for freely
 * licensed photos taken around its point (geosearch, up to 300 m, then 600 m) and records the best
 * one in image_rights as match = 'area': the neighborhood around the place, never presented as the
 * place itself (lib/data.ts placePhoto labels it). Same rules as the database's own pipeline
 * (img_ingest): CC0 / public domain / CC BY / CC BY-SA, no restrictions, an author to credit,
 * JPEG/PNG/WebP, landscape, at least 1000 px wide, taken 2005 or later, and a title that is a
 * street or building, not a person, an event, a vehicle, artwork or food. Neighbors get different
 * files where possible, so a list does not repeat one photo. Takedown stays one img_remove() call.
 *
 * Writes only to image_rights in project zqfscuwkxcoktpjhaebv (SUPABASE_SERVICE_KEY), and
 * bridge/out/photo-fill.json with what it chose. DRY_RUN=1 writes the report only.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://zqfscuwkxcoktpjhaebv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SUPABASE_SERVICE_KEY missing'); process.exit(1); }
const DRY = process.env.DRY_RUN === '1';
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const UA = { 'User-Agent': 'YaYNYC-images/1.0 (https://yaynyc.com/image-credits)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok && r.status !== 206) throw new Error(`GET ${path.split('?')[0]}: ${r.status}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const strip = (t) => (t ? String(t).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || null : null);
const licenseOk = (l) => !!l && !/(NC|ND|non-?commercial|no ?deriv|fair use|GFDL|all rights)/i.test(l)
  && /^(CC0( 1\.0)?|Public domain|PD[- ].*|PD|CC BY(-SA)? [1-4]\.0( [a-z-]+)?|CC BY(-SA)?)$/i.test(l);
// not the neighborhood: people, events, vehicles, artwork, food, documents, interiors
const NOT_STREET = /(portrait|selfie|\bDJ\b|concert|perform|parade|protest|march\b|rally|festival|marathon|wedding|crowd|people|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|girl|\bboy|child|kids|\bdog\b|\bcat\b|\bbus\b|taxi|\bcab\b|\bcar\b|\bcars\b|truck|chevy|chevrolet|camaro|\bford\b|bmw|toyota|honda|locomotive|\btrain\b|police|\bNYPD\b|\bFDNY\b|fire engine|ambulance|mural|graffiti|street art|\bart\b|artwork|collective|installation|exhibit|sculpture|statue|mapillary|interior|inside|lobby|\broom\b|\bfood\b|dish|menu|plate|crab|cocktail|\bdrink|beer|wine|logo|\bmap\b|diagram|\bplan\b|screenshot|poster|flyer|ticket|\bsign\b|signage|plaque|parking|violation|bike ?rack|roller|\bframe\b|\bfence\b|\bband\b|\bshow\b|\btour\b|\bgig\b|\bstage\b|\bparty\b|\bevent\b|halloween|filming|\bset\b|bird|squirrel|flower|tree\b|snow ?storm|blizzard|flood|fire\b|accident|crash|construction site|demolition|night sky|moon|sunset|aerial|\s(at|@)\s+(?!\d))/i;
// the title must say it shows a street, a building or a public place (or name the neighborhood)
const STREETISH = /\b(st|street|av|ave|avenue|blvd|boulevard|road|rd|place|pl|broadway|bowery|row|building|bldg|houses?|church|cathedral|synagogue|temple|station|sta|bridge|park|square|sq|plaza|corner|block|storefront|facade|brownstones?|tenements?|armory|school|library|hotel|tower|market|pier|terrace|parkway|pkwy|looking|skyline|waterfront|exterior)\b/i;

function meters(a, b) {
  const R = 6371000, k = Math.PI / 180, dLa = (b[0] - a[0]) * k, dLo = (b[1] - a[1]) * k;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function commons(lat, lng, radius) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&generator=geosearch&ggsnamespace=6&ggslimit=100&ggsradius=${radius}&ggscoord=${lat}%7C${lng}`
    + '&prop=imageinfo%7Ccoordinates&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=1280'
    + '&iiextmetadatafilter=LicenseShortName%7CLicenseUrl%7CArtist%7CObjectName%7CImageDescription%7CRestrictions%7CDateTimeOriginal';
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: UA });
    if (r.ok) return ((await r.json()).query?.pages ?? []);
    await sleep(2000 * 2 ** i);
  }
  return [];
}

function candidate(p, at, hood) {
  const ii = p.imageinfo?.[0];
  if (!ii) return null;
  const md = ii.extmetadata ?? {};
  const lic = md.LicenseShortName?.value;
  const title = p.title ?? '';
  const author = strip(md.Artist?.value);
  const year = Number(String(strip(md.DateTimeOriginal?.value) ?? '').match(/(19|20)\d\d/)?.[0] ?? 0);
  const c = p.coordinates?.[0];
  const why =
    !['image/jpeg', 'image/png', 'image/webp'].includes(ii.mime) ? 'not a photo'
    : !licenseOk(lic) ? 'license'
    : strip(md.Restrictions?.value) ? 'restrictions'
    : !author && !/^(CC0|PD|Public domain)/i.test(lic) ? 'no author'
    : (ii.width ?? 0) < 1000 ? 'too small'
    : !(ii.width > ii.height) ? 'portrait orientation'
    : year < 2005 ? 'older than 2005 or undated'
    : NOT_STREET.test(`${title} ${strip(md.ObjectName?.value) ?? ''}`) ? 'not a street view'
    : !(STREETISH.test(title) || (hood && title.toLowerCase().includes(hood.toLowerCase()))) ? 'title does not name a street or building'
    : null;
  if (why) return null;
  const dist = c ? Math.round(meters(at, [c.lat, c.lon])) : null;
  if (dist === null) return null;
  return {
    file_title: title, source_page: ii.descriptionurl, thumb_url: ii.thumburl, width: ii.width, height: ii.height, mime: ii.mime,
    title: strip(md.ObjectName?.value), author: author?.slice(0, 200) ?? null,
    author_url: String(md.Artist?.value ?? '').match(/href="([^"]+)"/)?.[1] ?? null,
    license: lic, license_url: md.LicenseUrl?.value ?? null, description: strip(md.ImageDescription?.value)?.slice(0, 400) ?? null,
    distance_m: dist, taken: String(year),
    // nearer first; a title that names a street or building counts as 150 m nearer
    score: dist,
  };
}

const [bars, venues, have] = await Promise.all([
  get('site_bars?select=slug,name,hood,hood_slug,lat,lng'),
  get('site_venues?select=id,name,neighborhood,lat,lng'),
  get('site_images?select=subject_kind,subject_key,file_title'),
]);
const has = new Set(have.map((x) => `${x.subject_kind}:${x.subject_key}`));
const used = new Map(); // file -> how many places already show it
for (const x of have) used.set(x.file_title, (used.get(x.file_title) ?? 0) + 1);

const todo = [
  ...bars.filter((b) => !has.has(`bar:${b.slug}`)).map((b) => ({ kind: 'bar', key: b.slug, name: b.name, hood: b.hood, lat: b.lat, lng: b.lng, radii: [300, 600] })),
  ...venues.filter((v) => !has.has(`venue:${v.id}`)).map((v) => ({ kind: 'venue', key: v.id, name: v.name, hood: v.neighborhood, lat: v.lat, lng: v.lng, radii: [400, 800] })),
];
console.log(`bars ${bars.length}, venues ${venues.length}; without a photo: ${todo.length}`);

const report = { ran: new Date().toISOString(), dry: DRY, without: todo.length, chosen: [], none: [], insert: { ok: 0, failed: 0 } };
for (const s of todo) {
  if (s.lat == null || s.lng == null) { report.none.push({ kind: s.kind, key: s.key, why: 'no coordinates' }); continue; }
  let pick = null;
  for (const r of s.radii) {
    const cands = (await commons(s.lat, s.lng, r)).map((p) => candidate(p, [s.lat, s.lng], s.hood)).filter(Boolean);
    await sleep(400);
    // a file nobody shows yet, else the least used
    cands.sort((a, b) => (used.get(a.file_title) ?? 0) - (used.get(b.file_title) ?? 0) || a.score - b.score);
    if (cands.length) { pick = cands[0]; break; }
  }
  if (!pick) { report.none.push({ kind: s.kind, key: s.key, why: 'no free street photo within range' }); continue; }
  used.set(pick.file_title, (used.get(pick.file_title) ?? 0) + 1);
  const { score, ...row } = pick;
  report.chosen.push({ kind: s.kind, key: s.key, file: row.file_title, m: row.distance_m, license: row.license });
  if (DRY) continue;
  const res = await fetch(`${URL}/rest/v1/image_rights?on_conflict=subject_kind,subject_key,file_title`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ subject_kind: s.kind, subject_key: s.key, ...row, source: 'wikimedia_commons', match: 'area', status: 'approved' }),
  });
  if (res.ok) report.insert.ok++; else { report.insert.failed++; if (report.insert.failed <= 3) report.insert.error = `${res.status} ${(await res.text()).slice(0, 300)}`; }
}

const after = DRY ? null : await get('site_images?select=subject_kind,subject_key,match');
if (after) {
  const a = new Set(after.map((x) => `${x.subject_kind}:${x.subject_key}`));
  report.coverage = {
    bars: `${bars.filter((b) => a.has(`bar:${b.slug}`)).length}/${bars.length}`,
    venues: `${venues.filter((v) => a.has(`venue:${v.id}`)).length}/${venues.length}`,
    hoods: after.filter((x) => x.subject_kind === 'hood').length,
    by_match: after.reduce((o, x) => ((o[`${x.subject_kind}:${x.match}`] = (o[`${x.subject_kind}:${x.match}`] ?? 0) + 1), o), {}),
  };
  report.hoods_missing = [...new Set(bars.filter((b) => !a.has(`bar:${b.slug}`)).map((b) => b.hood_slug))].filter((h) => !a.has(`hood:${h}`));
}
mkdirSync('bridge/out', { recursive: true });
writeFileSync('bridge/out/photo-fill.json', JSON.stringify(report, null, 1));
console.log(`chosen ${report.chosen.length}, none ${report.none.length}, inserted ${report.insert.ok}, failed ${report.insert.failed}`);
if (report.coverage) console.log(`coverage: bars ${report.coverage.bars}, venues ${report.coverage.venues}`);
