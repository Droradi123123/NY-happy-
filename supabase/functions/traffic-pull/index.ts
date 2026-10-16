// Daily pull of Search Console and GA4 numbers into gsc_queries, gsc_pages, ga_pages and ga_events.
// Google access is a read-only service account (secret GOOGLE_SA_JSON; GA4_PROPERTY_ID is the numeric
// property id). Called by pg_cron through pg_net with the x-pull-token header (Vault: traffic_pull_token).
// Search Console data settles after 2-3 days, so every run re-pulls the last 4 days and upserts.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SITE = 'sc-domain:yaynyc.com';
const DB = Deno.env.get('SUPABASE_URL')!, SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const day = (d: Date) => d.toISOString().slice(0, 10);
const path = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

async function googleToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const part = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly',
  })}`;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`google token: ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token as string;
}

async function upsert(table: string, rows: Record<string, unknown>[], conflict: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await fetch(`${DB}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST', body: JSON.stringify(rows.slice(i, i + 1000)),
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return rows.length;
}

async function gsc(tok: string, d: string, dimensions: string[]) {
  const rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] = [];
  for (let start = 0; ; start += 25000) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: d, endDate: d, dimensions, rowLimit: 25000, startRow: start, dataState: 'all' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`search console: ${JSON.stringify(j).slice(0, 300)}`);
    rows.push(...(j.rows ?? []));
    if ((j.rows ?? []).length < 25000) return rows;
  }
}

async function ga(tok: string, prop: string, body: unknown) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`analytics: ${JSON.stringify(j).slice(0, 300)}`);
  return (j.rows ?? []) as { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
}

async function log(ok: boolean, detail: unknown) {
  await fetch(`${DB}/rest/v1/traffic_pulls`, {
    method: 'POST', body: JSON.stringify({ ok, detail }),
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
  });
}

Deno.serve(async (req) => {
  const check = await fetch(`${DB}/rest/v1/rpc/traffic_pull_token_ok`, {
    method: 'POST', body: JSON.stringify({ t: req.headers.get('x-pull-token') ?? '' }),
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json' },
  });
  if (!check.ok || (await check.json()) !== true) return new Response('forbidden', { status: 403 });
  const { days = 4 } = await req.json().catch(() => ({}));
  const detail: Record<string, unknown> = {};
  try {
    const raw = Deno.env.get('GOOGLE_SA_JSON');
    if (!raw) throw new Error('GOOGLE_SA_JSON is not set');
    const tok = await googleToken(JSON.parse(raw));
    const n = Math.min(Math.max(Number(days) || 4, 1), 90);
    const dates = Array.from({ length: n }, (_, i) => day(new Date(Date.now() - (i + 1) * 864e5)));

    // Search Console: per day, query x page (anonymized queries drop out) and page totals (complete)
    let q = 0, p = 0;
    for (const d of dates) {
      q += await upsert('gsc_queries', (await gsc(tok, d, ['query', 'page'])).map((r) => ({
        day: d, query: r.keys[0], page: path(r.keys[1]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      })), 'day,query,page');
      p += await upsert('gsc_pages', (await gsc(tok, d, ['page'])).map((r) => ({
        day: d, page: path(r.keys[0]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      })), 'day,page');
    }
    Object.assign(detail, { gsc_queries: q, gsc_pages: p });

    const prop = Deno.env.get('GA4_PROPERTY_ID');
    if (prop) {
      const range = [{ startDate: dates.at(-1), endDate: dates[0] }];
      const iso = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
      const pages = await ga(tok, prop, {
        dateRanges: range, limit: 100000,
        dimensions: [{ name: 'date' }, { name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'engagedSessions' }, { name: 'userEngagementDuration' }],
      });
      detail.ga_pages = await upsert('ga_pages', pages.map((r) => ({
        day: iso(r.dimensionValues[0].value), page: r.dimensionValues[1].value, channel: r.dimensionValues[2].value,
        sessions: +r.metricValues[0].value, users: +r.metricValues[1].value, views: +r.metricValues[2].value,
        engaged: +r.metricValues[3].value, engagement_sec: +r.metricValues[4].value,
      })), 'day,page,channel');
      const events = await ga(tok, prop, {
        dateRanges: range, limit: 100000,
        dimensions: [{ name: 'date' }, { name: 'eventName' }, { name: 'pagePath' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['ticket_click', 'booking_click', 'directions_click', 'call_click', 'outbound_click', 'sign_up', 'home_chip', 'menu_open'] } } },
      });
      detail.ga_events = await upsert('ga_events', events.map((r) => ({
        day: iso(r.dimensionValues[0].value), event: r.dimensionValues[1].value, page: r.dimensionValues[2].value, n: +r.metricValues[0].value,
      })), 'day,event,page');
    } else detail.ga = 'GA4_PROPERTY_ID is not set';
    await log(true, detail);
    return Response.json({ ok: true, ...detail });
  } catch (e) {
    detail.error = String(e);
    await log(false, detail);
    return Response.json({ ok: false, ...detail }, { status: 500 });
  }
});
