/**
 * QA only: build the site from a frozen data snapshot and a fixed clock, so two builds (before and after a
 * change) see exactly the same data and the same "now". Nothing in the site imports this file.
 *
 *   YAY_SNAPSHOT=<dir> YAY_BUILD_NOW=2026-10-16T16:00:00Z NODE_OPTIONS="--import=$PWD/scripts/qa/snapshot-preload.mjs" npx astro build
 *
 * YAY_SNAPSHOT: one JSON array per Supabase REST path, named encodeURIComponent(path) + ".json"
 *   (exported with the anon role, so it holds exactly what the public key can read).
 *   Every other network request fails, so a build cannot silently mix live data in.
 * YAY_BUILD_NOW: the clock starts at this instant and runs normally from there.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.YAY_SNAPSHOT;
const at = process.env.YAY_BUILD_NOW;

if (at) {
  const t0 = Date.parse(at), start = Date.now(), RealDate = Date;
  const now = () => t0 + (RealDate.now() - start);
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now()); }
    static now() { return now(); }
  };
}

if (dir) {
  const file = (p) => join(dir, `${encodeURIComponent(p).replace(/\*/g, '%2A')}.json`);
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    const m = url.match(/\/rest\/v1\/(.+)$/);
    if (!m) throw new Error(`snapshot build: network blocked for ${url}`);
    const f = file(decodeURIComponent(m[1]));
    if (!existsSync(f)) throw new Error(`snapshot build: no snapshot for ${m[1]}`);
    const rows = JSON.parse(readFileSync(f, 'utf-8'));
    const range = new Headers(init.headers).get('Range');
    const [a, b] = range ? range.split('-').map(Number) : [0, rows.length - 1];
    return new Response(JSON.stringify(rows.slice(a, b + 1)), { status: range ? 206 : 200, headers: { 'content-type': 'application/json' } });
  };
}
