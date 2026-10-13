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
