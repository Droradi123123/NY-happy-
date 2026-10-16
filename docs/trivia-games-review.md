# Trivia nights and bars with games: review before release (Oct 16, 2026)

Status: built and tested locally on branch `trivia-games-local`. Nothing committed, pushed or deployed.

## What is published (from the manifest)

| | Public | Internal (held) |
|---|---|---|
| Trivia nights (incl. 1 music trivia) | 258 at 254 venues | 331 |
| Music bingo (never counted as trivia) | 24 at 24 venues | 3 |
| Games listings | 41 at 29 venues | 80 |

Full list with the reason for every held row (internal, not in the repo): `/tmp/claude-0/-home-user/c19f2bd1-ff24-5797-8bcf-cd87913c631f/scratchpad/trivia/publication_manifest.csv`.

Why rows are held (first reason): one source only 209 · pinball-map-only lead 73 · no verified address 50 ·
only two aggregators agree 44 · sources disagree on the time 16 · paused per the operator 7 · two businesses at
one address 6 · no official or two editorial sources (games) 6 · starts later 2 · two competing times 1.

## Evidence policy (applied per listing, never per venue)

Trivia / music bingo, public only when all hold:
- T1 the street address matches a New York City address record (NYC Planning GeoSearch: same house number,
  same street words, same borough as the sources). A name alone never identifies a venue.
- T2 not one of two different businesses at the same address, unless the operator lists this one.
- T3 not excluded, not paused, not "starts later", per the newest source.
- T4 the trivia company itself lists it this week (NYC Trivia League, TriviaNYC, Uptown Pub Quiz), or two sources
  agree on day AND time and one of them is a curated directory (NYC Trivia List, Brooklyn Trivia Finder). Two
  aggregators (BadSlava, TriviaNearMe) agreeing is not enough. A workbook credit to an operator counts only when
  our own read of that operator's page found the venue on that day.
- T5 one start time: the operator's, or the one the agreeing sources share.

Wording: "Weekly, per NYC Trivia League" only where a source says weekly; "Monthly, per NYC Trivia League" where its
record says monthly; otherwise "Listed on Tuesdays. Confirm with the venue." Host and prize only when a source
states them, attributed. Dates: "read Oct 16, 2026" (observed) and, only for NYC Trivia League, the schedule week
the page itself states. No fact is labelled verified or confirmed.

Games: same address rule; curated research only (pinball-map leads stay internal); the venue's own site or two
editorial sources; hours and prices only from the venue's own site ("per its website"); alcohol as stated, cafés
marked "alcohol not confirmed".

## What the enrichment added
- City address check (GeoSearch) for all 549 addressed candidates: 543 verified, 6 held. Pete's Saloon
  ("8 W Main St, Queens", really Elmsford) is rejected: GeoSearch offers Roosevelt Island fallbacks at
  confidence 0.8, and the strict rule refuses them. Solid State (Woodside, Queens) verifies.
- Re-read of the operator and directory pages (612 observations): 8 hiatuses caught (EastVille Comedy Club,
  On The 7, Bondi Sushi, Brooklyn Brewery, Fornino, T-Squared Social, 31st Ave Open Street, J. Kennedy's).
- NYC Trivia League's own venue records (159, with address, website, stated "Monthly"): 28 identities resolved,
  6 duplicate venues merged.

## Needs a human decision (kept internal or flagged)
- League address differs from the workbook, league address used for league nights: Due West (189 W 10th St vs
  67 7th Ave S), The Hamilton (998 Amsterdam vs 260 W 73rd), The High Note (119 E 15th vs 240 E 35th).
- Two businesses at one address: Pink Metal / Post No Bills (253 Bushwick Ave), Endless Life / Gun Hill (52 34th
  St), Strong Rope / Forever Brewing (574 President St: TriviaNYC lists Forever Brewing).
- Possibly closed bars on our own site (same address, other business listed for trivia): keybar vs Farewell Bar
  (143 Troutman St), Iris Cafe vs the-binc (live). Not touched.
- Venue-site confirmation by research agents could not open web pages; their snippet-based leads (e.g. Irish
  Rover lists Thursday, not Wednesday; Interboro reported closed) were NOT used to publish anything.

## Routes (new, 14) and index policy
Indexable, in the sitemap, lastmod = Oct 16, 2026 (the read date):
`/trivia`, `/trivia/{monday,tuesday,wednesday,thursday,friday,sunday}`, `/trivia/{manhattan,brooklyn,queens}`,
`/music-bingo`, `/bars-with-games`, `/bars-with-games/{arcade-bars,pinball-bars}`.
Kept as sections, not URLs: Saturday (1 night), the Bronx (2) and Staten Island (1), neighborhoods, the other
games. "Tonight" is computed in the browser in New York time, not a URL. No Event markup (no dated events).

## Existing files changed
- `site/src/layouts/Base.astro`: menu group "Trivia and games", two footer links (every page).
- `site/src/pages/bars/[slug].astro`: trivia/games block on 56 bar pages; "Deal last confirmed" only when a
  re-read confirmed it, else "Deal as published on X, read DATE" (706 pages); the "Today" badge is computed in the
  browser (it was fixed at build time).
- `site/src/pages/parties/venue/[id].astro`: trivia/games block on 2 club pages.
- `site/src/pages/sitemap.xml.ts`: the 14 new URLs.
- `site/scripts/verify-build.mjs`: activities.json checks and internal-data leak checks.
New: `site/src/lib/activities.ts`, `site/src/data/activities.json`, `site/src/components/{TriviaRows,GameVenues}.astro`,
`site/src/pages/{trivia/*,music-bingo.astro,bars-with-games/*}`, `scripts/activities/*`, `site/scripts/qa/*`.
Database (private, RLS on, nothing public): tables `activity_venues/listings/exclusions/imports/geo`, functions
`activity_geo_request/ingest`. No `site_*` view reads them.

## QA results (same data snapshot, clock fixed at Oct 16, 2026 12:00 New York)
| Check | Result |
|---|---|
| Build + gate | pass: 1490 pages (1476 + 14), no broken links, keywords unique |
| Existing pages | 0 unexplained differences in URL, canonical, title, description, robots, h1, JSON-LD, main text |
| Approved differences | menu 1476, footer 1476, deal wording 706, Today badge 706, trivia/games block 58 |
| Sitemap | +14, -0, lastmod changes 0 |
| robots.txt, llms.txt, /data/*.json, _redirects, _headers | identical |
| Counts | hub 258/254 = data; day pages + Saturday = 258; boroughs match; bingo 24, 0 on trivia pages |
| Leaks | no held venue, pinball-map lead, noaddr key or internal field in HTML/JSON/sitemap |
| Geography | all 289 public venues verified in the five boroughs |
| Time | 15 tests: overlap rules, past-midnight windows, unknown times, NY weekday across DST |
| Structured data | 29 blocks parsed; FAQ text matches the page; ItemList URLs built; no Event. Local validation only (validator.schema.org not reachable) |
| Screenshots | phone 375 and desktop 1280: no horizontal overflow on new pages, keyboard reaches content, no JS errors |
| Lighthouse (mobile, lab) | existing pages unchanged (home 95, day page 89, bar page 99); new pages 98-100, a11y 100, CLS ≤ 0.037 |
| Pre-existing, not caused here | one bar page overflows 16px on phones in baseline and modified alike |

## Release (each step needs your go)
1. Commit on `claude/lucid-keller-2hsgwn`. 2. Push (Cloudflare rebuilds and deploys in about 3 minutes).
3. Ping IndexNow for the 14 URLs; resubmit the sitemap in Search Console.
Rollback: revert the release commit and push (or roll back to the previous version in Cloudflare Workers).
The DB tables are private and need no rollback.

## After launch (proposal, needs approval)
- Search Console: baseline the 14 URLs and the 58 changed bar/club pages before release; then watch
  indexing (Pages report), impressions for "trivia nights nyc", "<day> trivia nyc", "<borough> trivia nights",
  "bars with games nyc", "arcade bars nyc", "pinball bars nyc", "music bingo nyc" weekly for 4-8 weeks.
  No automatic rollback on a drop: check seasonality, other changes and errors first, then ask.
- Freshness: trivia schedules go stale fast. A weekly re-read of NYC Trivia League's schedule and records (the
  same pg_net fetch) would catch hiatuses; not set up without your approval.
