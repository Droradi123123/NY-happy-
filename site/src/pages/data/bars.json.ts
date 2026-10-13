import type { APIRoute } from 'astro';
import { allBars } from '../../lib/data';
import { barRow } from '../../lib/index';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await allBars()).map(barRow)), { headers: { 'Content-Type': 'application/json' } });
