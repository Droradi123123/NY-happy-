/**
 * Artist and promoter pages (/parties/artist/<slug>, /parties/promoter/<slug>). People search a DJ or a
 * party series by name ("crankdat nyc set times", "teksupport"), and a party page leaves the site once
 * its night is over, so those searches used to land on a redirect. These pages stay: they are built from
 * the upcoming nights and from src/data/people-ledger.json, which keeps every published night's lineup and
 * promoter with no time limit, so a page that exists once keeps existing.
 *
 * Everything on them is read from the ticket listings: who is billed, where, when, the genres the sellers
 * tag. A page is indexed when it has enough to say (see `indexable`); the rest are built noindexed.
 */
import { partyData, slugify, type Party, type Venue } from './data';
import { pathKept } from './indexScope';
import ledger from '../data/people-ledger.json';

export interface LedgerNight { slug: string; title: string; night_date: string; venue_id: string | null; performers: string[]; organizer: string | null; genres: string[] }
export interface Person {
  kind: 'artist' | 'promoter'; slug: string; name: string; path: string;
  upcoming: Party[]; past: LedgerNight[]; venues: { v: Venue; n: number }[]; genres: [string, number][];
  /** artists billed with this one (artist pages) or booked by this promoter, by nights together */
  with: [string, number][];
  indexable: boolean;
}

// "Bruce Wayne (US)" is the DICE way to tell two artists apart; the page is about the artist
const display = (n: string) => n.replace(/\s*\((us|uk|de|fr|it|nl|br|au|ca|es|il)\)\s*$/i, '').trim();
/** the same rule as scripts/ended-redirects.mjs (artistSlug) */
export const artistSlug = (n: string) => slugify(display(n));
// billing placeholders, not artists
const NOT_A_NAME = /^(tba|tbd|tba\.|special guests?|more|guests?|residents?|resident djs?|dj|djs|b2b|and more|\+ more|lineup tba|secret guest|surprise guest)$/i;
// "Joonbug Presents" -> "Joonbug"; "Deluxx Fluxx NYC " -> "Deluxx Fluxx NYC"
const promoterName = (o: string) => o.trim().replace(/\s+(presents|present|productions|entertainment inc\.?|inc\.?|llc)$/i, '').trim();
const norm = (t: string) => slugify(t).replace(/-(nyc|new-york|brooklyn|ny)\b/g, '').replace(/^the-/, '');

let cache: Promise<{ artists: Person[]; promoters: Person[] }> | null = null;
export function people() {
  cache ??= (async () => {
    const { parties, venues } = await partyData();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const live = new Set(parties.map((p) => p.slug));
    const past = (ledger as LedgerNight[]).filter((n) => !live.has(n.slug) && n.night_date < today);
    const venueById = new Map(venues.map((v) => [v.id, v]));
    // a name that is a venue's (or a promoter that is the venue itself) has the venue page already
    const venueKeys = new Set(venues.map((v) => norm(v.name)));

    type Acc = { names: Map<string, number>; upcoming: Party[]; past: LedgerNight[] };
    const build = (kind: Person['kind'], acc: Map<string, Acc>, lineup: (x: { performers: string[]; organizer: string | null }) => string[]): Person[] => {
      const out: Person[] = [];
      for (const [slug, a] of acc) {
        const name = [...a.names].sort((x, y) => y[1] - x[1])[0][0];
        const all = [...a.upcoming.map((p) => ({ venue_id: p.venue_id, genres: p.genres, performers: p.performers ?? [], organizer: p.organizer })), ...a.past];
        const vc = new Map<string, number>(), gc = new Map<string, number>(), wc = new Map<string, number>();
        for (const n of all) {
          if (n.venue_id) vc.set(n.venue_id, (vc.get(n.venue_id) ?? 0) + 1);
          for (const g of n.genres ?? []) gc.set(g, (gc.get(g) ?? 0) + 1);
          for (const o of lineup(n)) { const s = artistSlug(o); if (s && s !== slug && !NOT_A_NAME.test(display(o))) wc.set(display(o), (wc.get(display(o)) ?? 0) + 1); }
        }
        const path = `/parties/${kind}/${slug}`;
        const total = all.length;
        // an artist page is worth indexing with two nights on our list, or as the headliner of an upcoming one;
        // a promoter page with three nights. Pages that already had Google impressions stay indexed.
        // a headliner: billed first on an upcoming night we have written up
        const headliner = kind === 'artist' && a.upcoming.some((p) => (p.performers ?? [])[0] && artistSlug(p.performers[0]) === slug && !!p.copy?.about);
        const indexable = pathKept(path) || (kind === 'artist' ? total >= 2 || headliner : total >= 3);
        out.push({
          kind, slug, name, path, upcoming: a.upcoming, past: a.past.sort((x, y) => y.night_date.localeCompare(x.night_date)),
          venues: [...vc].map(([id, n]) => ({ v: venueById.get(id)!, n })).filter((x) => x.v).sort((x, y) => y.n - x.n),
          genres: [...gc].sort((x, y) => y[1] - x[1]), with: [...wc].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])), indexable,
        });
      }
      return out.sort((x, y) => x.slug.localeCompare(y.slug));
    };

    // artists
    const art = new Map<string, Acc>();
    const addArtist = (raw: string, p: Party | null, n: LedgerNight | null) => {
      const name = display(raw);
      const slug = artistSlug(raw);
      if (!slug || slug.length < 2 || NOT_A_NAME.test(name) || venueKeys.has(norm(name))) return;
      const a = art.get(slug) ?? { names: new Map(), upcoming: [], past: [] };
      a.names.set(name, (a.names.get(name) ?? 0) + 1);
      if (p && !a.upcoming.includes(p)) a.upcoming.push(p);
      if (n && !a.past.some((x) => x.slug === n.slug)) a.past.push(n);
      art.set(slug, a);
    };
    for (const p of parties) for (const x of p.performers ?? []) addArtist(x, p, null);
    for (const n of past) for (const x of n.performers ?? []) addArtist(x, null, n);

    // promoters (not the venue presenting its own night)
    const pro = new Map<string, Acc>();
    const addPromoter = (raw: string | null, venueId: string | null, p: Party | null, n: LedgerNight | null) => {
      if (!raw) return;
      const name = promoterName(raw);
      const key = norm(name);
      const v = venueId ? venueById.get(venueId) : null;
      if (!key || key.length < 3 || venueKeys.has(key) || (v && (norm(v.name).startsWith(key) || key.startsWith(norm(v.name))))) return;
      const slug = slugify(name);
      const a = pro.get(slug) ?? { names: new Map(), upcoming: [], past: [] };
      a.names.set(name, (a.names.get(name) ?? 0) + 1);
      if (p) a.upcoming.push(p);
      if (n) a.past.push(n);
      pro.set(slug, a);
    };
    for (const p of parties) addPromoter(p.organizer, p.venue_id, p, null);
    for (const n of past) addPromoter(n.organizer, n.venue_id, null, n);

    const artists = build('artist', art, (n) => n.performers ?? []);
    // a promoter's "with" list is the artists it booked
    const promoters = build('promoter', pro, (n) => n.performers ?? []);
    // an artist and a promoter can share a name: the artist keeps it (its keyword is "<name> nyc", the promoter's "<name> events nyc")
    return { artists, promoters };
  })();
  return cache;
}

/** the artist page for a billed name, when the build makes one */
export async function artistHref(name: string): Promise<string | null> {
  const { artists } = await people();
  const s = artistSlug(name);
  return artists.some((a) => a.slug === s) ? `/parties/artist/${s}` : null;
}
export async function promoterHref(organizer: string | null): Promise<string | null> {
  if (!organizer) return null;
  const { promoters } = await people();
  const s = slugify(promoterName(organizer));
  return promoters.some((a) => a.slug === s) ? `/parties/promoter/${s}` : null;
}
