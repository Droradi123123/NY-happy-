import type { APIRoute } from 'astro';
import { partyData } from '../../lib/data';
import { partyRow } from '../../lib/index';

export const GET: APIRoute = async () => {
  const { parties, venues } = await partyData();
  return new Response(JSON.stringify(parties.map((p) => partyRow(p, venues))), { headers: { 'Content-Type': 'application/json' } });
};
