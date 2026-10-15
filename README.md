# NY happy

Every verified happy hour in New York City, with the deal, the hours, and the date we last checked.

## Supabase

- Project: **NY happy** — `zqfscuwkxcoktpjhaebv` (us-east-1)
- URL: `https://zqfscuwkxcoktpjhaebv.supabase.co`
- Schema: `supabase/migrations/`

| Table | What it holds |
|---|---|
| `h_nyc_happy_hour` | The venues and their happy hour facts (`status` = live / pending / rejected) |
| `h_verticals` | The vertical definition (`nyc-happy-hour`) and its data contract |
| `h_runs` | Log of each data-collection pass |
| `nychh_events` | Site analytics events (anon can insert) |
| `nyc_happy_hour_readable` (view) | Flattened view of `h_nyc_happy_hour` for browsing |

Anon can read only rows where `status = 'live'`.

### Parties

| Table | What it holds |
|---|---|
| `party_events` | One row per night: facts with source and check date for every field, status, page copy |
| `party_venues` | Venues and their rooms, neighborhood, Google verification |
| `party_leads` | Events seen on other sources, waiting to be merged or rejected |
| `party_sources` | The source list: what each is good for, how it may be read |
| `party_rules` | Genre and tag keyword rules |
| `party_runs`, `party_fetches` | Run log and the page-fetch queue |

The site reads only `publish_status = 'published'`. Updating runs through the `nyc-parties` skill
(`.claude/skills/nyc-parties/SKILL.md`); schema and functions in `supabase/migrations/`.
The first data came from `nyc-parties-oct-dec-2026-v2.xlsx` (`scripts/parties/xlsx_to_sql.py`).

**Google Places:** store the key once in the Supabase SQL editor:
`select vault.create_secret('<key>', 'google_maps_api_key');` (it stays inside the database).

## Photos (legal by construction)

Freely licensed files from Wikimedia Commons only (CC0, public domain, CC BY or CC BY-SA),
self-hosted, in this order: (1) a photo of the place itself; (2) a street photo taken within ~70 m
(Commons geosearch, step `commons_geo`, `match = 'nearby'`: street or building titles only, taken
2005 or later, landscape, no people), captioned "The street outside <name>"; (3) on a bar page,
its neighborhood's photo, captioned as such; in card grids, a designed card. Nothing is taken from bar, club or ticket sites or
Instagram. Google Places photos are **not** used: Google's terms forbid caching photos, photo
names or other Places content (Maps Platform ToS 3.2.3(b)). The Places job (`gp_places`, pg_cron
`yay-google-places`, Vault secret `google_maps_api_key`) stores only the Place ID, which the terms
allow, so pages can link to the exact place on Google Maps.

- `image_rights` holds every candidate with its author, license, source page and verdict.
  Rules (in `img_ingest()`): photo MIME, allowed license, no Commons restrictions template,
  the file names the bar/venue and says it is in NYC, not a performer or portrait, ≥800px wide,
  an author to credit unless CC0/PD. Neighborhoods use the lead photo of their Wikipedia article.
- A pg_cron job (`yay-images`, every minute) runs `img_ingest()` then `img_request(4)`;
  everything is re-checked every 60 days.
- `site_images` (public view) gives one photo per bar / venue / neighborhood.
- The site build (`site/scripts/fetch-images.mjs`) downloads them and serves them from our
  own domain, with the credit next to each photo and a full list on `/image-credits`.
- Takedown: `select img_remove('File:Name.jpg');` then rebuild. It stays removed.
