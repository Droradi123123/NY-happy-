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
