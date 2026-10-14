# yaynyc.com content backlog: 30 topics

Date: 2026-10-13. **Search demand is unmeasured for every topic**: no keyword or Search Console data has been supplied. Priority is a judgement from intent, competition seen in the brief (Time Out, The Infatuation, Stoop, seasonal party roundups) and, above all, **whether our own verified records can answer the question**. Counts are from the live database and site on 2026-10-13.

**Ground rules applied to every row:**
- A topic that an existing route already answers improves that route; it does not get a competing blog post.
- No variation (borough, day) is created unless its answer is different.
- Unknown facts stay unknown.
- Happy-hour data was last checked Sep 1–3, so every table shows its check dates until the re-check described in the audit (F2).

**Priority key:**
- **P1**: write now, data is sufficient.
- **P2**: next, after a data step.
- **P3**: later.
- **HOLD**: not enough verified data.

## Wave 1: deals and seasonal parties

| # | Topic | Primary intent | Existing route | Proposed route | Data required | Evidence available | Gaps | Priority | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cheapest NYC happy hours by neighborhood | "where is the cheapest happy hour in my area" | `/happy-hours/cheap-drinks` (bars ≤ $6) + each neighborhood page's "cheapest" line | **Improve `/happy-hours/cheap-drinks`**: add a table of the cheapest numeric drink price per neighborhood, bar, item, source, checked date | numeric drink prices with item names | 313 bars with a numeric drink price; 31 neighborhoods with 3+ priced bars | Outliers (Ben & Jack's $1.75 beer, Mile 17 "$1 drinks") need re-check before they can top a table; data 41 days old | **P1** (after the outlier check) | Recompute at every build; re-check the table's bars every 30 days |
| 2 | Late-night happy hours in NYC | "happy hour after 9pm / reverse happy hour" | `/happy-hours/late-night` (28 bars) | **Improve existing**: table of late window start/end by day, borough, deal | late windows with days | 28 bars with a window after 9pm | Several have times but no deal | **P1** | Per build; re-check 28 bars monthly |
| 3 | Saturday happy hours | "happy hour saturday nyc" | `/happy-hours/saturday` (230) | **Improve existing**: Saturday-specific hours (often different from weekdays), earliest/latest, deals that only run Saturday | Saturday windows | 230 bars | Opening-hours confirmation for 45% only | **P1** | Per build |
| 4 | Sunday happy hours | "sunday happy hour nyc" | `/happy-hours/sunday` (262) | **Improve existing**, same approach as #3; note all-day Sunday deals | Sunday windows | 262 bars | Same | **P1** | Per build |
| 5 | Happy hours with food deals | "happy hour food deals nyc" | `/happy-hours/food` (163) | **Improve existing**: table of priced food items (wings, tacos, oysters, sliders) with price and source | priced food items | 163 bars with food in the deal; priced items for a subset | Item-name parsing artifacts (see audit F3) | **P1** | Per build |
| 6 | Oyster happy hours | "dollar oysters nyc" | `/happy-hours/oysters` (45) | **Improve existing**: price-per-oyster table, days/hours, source, checked date | oyster price per piece | 43 bars mention oysters; 22 with a numeric price | "Market price" and "each" phrasing must be read correctly | **P1** | Re-check monthly (oyster deals change often) |
| 7 | Drinks under $5 | "cheap drinks nyc under $5" | `/happy-hours/cheap-drinks` | **Merge into #1** (same page, "$5 and under" section). A separate page would compete. | numeric drink price < $5 or ≤ $5 | 21 bars under $5; 79 at $5 or less | Excludes "$X off" and deals without a price, by rule | **P1** (as part of #1) | Same as #1 |
| 8 | Rooftop happy hours | "rooftop happy hour nyc" | `/happy-hours/rooftop` (11) | Improve existing, adding heated/enclosed status | rooftop tag + season info | 11 bars | Winter open/closed status unknown; small set | **P3** (seasonal: revisit in spring) | Seasonal check |
| 9 | NYC Halloween parties 2026 | "halloween parties nyc 2026" | `/parties/halloween` (noindex, 0 published) | **Improve existing by publishing verified nights**: party pages + the hub (with a table by date, borough, price from, age) | per night: date, doors, venue, price from, age, source + check date, original copy | 141 upcoming candidates, re-checked from DICE Oct 13; 3 ready | 138 need original copy; rescheduled/postponed ones held | **P1**, time-critical: Oct 31 | Daily re-check until Nov 1; nights leave the site when over |
| 10 | Brooklyn Halloween parties | "brooklyn halloween parties" | none | **Section of #9** (filter + heading), not a separate route until 10+ Brooklyn nights are published | same as #9 | 70 Brooklyn candidates | Same as #9 | **P1** (inside #9) | Same as #9 |
| 11 | NYC New Year's Eve parties 2026 | "nye parties nyc 2026" | `/parties/new-years-eve` (built at 2+ published) | Existing route, populated by publishing | same as #9 | 34 candidates | Most packages not yet on sale; ticket tiers unknown | **P2** (publish from mid-Nov) | Weekly until December, then daily |
| 12 | NYE parties with advertised open bars | "open bar nye nyc" | none | Section of #11 only when records exist | which ticket tier includes the open bar, hours of the bar | **0 records mention an open bar** | No evidence at all | **HOLD** | — |

## Wave 2: local intent (improve existing pages first)

| # | Topic | Primary intent | Existing route | Proposed route | Data required | Evidence | Gaps | Priority | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| 13 | After-work drinks near Penn Station | commuters before a train | `/near/penn-station-msg` (43) + `/near/34th-street-penn-station-a-c-e` (5) | **Consolidate the pair** (approval needed), then improve: weekday windows that start 4–5pm, walking minutes | walk minutes, weekday windows | 43 bars within 800 m | Walk times are straight-line estimates for landmarks | **P2** | Per build |
| 14 | After-work drinks near Grand Central | same | `/near/grand-central` (38) | Improve existing (after-work framing, weekday table) | same | 38 bars | same | **P2** | Per build |
| 15 | Happy hours near Times Square | tourists, pre-theater | `/happy-hours/times-square` (35) + `/near/times-square` (53) + `/near/broadway-theater-district` (56) | **Pick one answer** (approval needed); the others link to it. Add "before a show" timing and the real price after tax and tip. | windows ending before 8pm curtain | 53 bars within 800 m | Three overlapping pages today | **P2** | Per build |
| 16 | Affordable night out in Williamsburg | "cheap night out williamsburg" | `/happy-hours/williamsburg` (43) | Improve the neighborhood page with a "cheap evening" section: happy hour plus a free/cheap party the same night | priced deals + published parties | 43 bars; parties unpublished | Needs published parties | **P3** | Weekly |
| 17 | Affordable night out in the East Village | same | `/happy-hours/east-village` (39) | Same approach | same | 39 bars | same | **P3** | Weekly |
| 18 | Affordable night out on the Lower East Side | same | `/happy-hours/lower-east-side` (23) | Same approach | same | 23 bars | same | **P3** | Weekly |
| 19 | After-work night out in Midtown | office crowd | `/happy-hours/midtown` (22) + Grand Central / Bryant Park near pages | Improve the Midtown page and link the near pages; no new route | weekday windows | 22 + near pages | Overlap with #14 | **P3** | Per build |
| 20 | A night out in Greenpoint | local | `/happy-hours/greenpoint` (13) | Improve the neighborhood page | same | 13 bars | Small set | **P3** | Weekly |
| 21 | Lower East Side bar crawl route | ordered route | none | New guide only with a verified order: walking distances from coordinates, windows that overlap in time, and a stated check date | coordinates, windows on the chosen day | 23 bars with coordinates | **Opening hours confirmed for 45% only**; a route needs them | **HOLD** until hours are verified | Re-check before every season |
| 22 | Williamsburg bar crawl route | same | none | Same | same | 43 bars | same | **HOLD** | same |

## Wave 3: needs more research or operations

| # | Topic | Primary intent | Existing route | Proposed route | Data required | Evidence | Gaps | Priority | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| 23 | NYC parties this weekend | "parties this weekend nyc" | `/parties` (explorer has a "This weekend" filter) | Improve `/parties` with a server-rendered "this weekend" section rebuilt daily; no separate page | published nights, daily rebuild | 101 nights in the next 7 days (unpublished) | **No daily rebuild is configured yet**; nothing published | **P2** after #9 and a daily rebuild | Daily build is mandatory; otherwise do not publish |
| 24 | Free NYC nightlife this week | "free things to do tonight nyc" | none | Section of `/parties` | price_status = free with what "free" means (RSVP, before a time) | 79 nights marked free | Need the condition behind "free" per night | **P2** | Daily |
| 25 | House music nights | "house music nyc" | `/parties/house` (built at 2+ published) | Existing route | published nights | 166 candidates | Unpublished | **P2** | Daily build |
| 26 | Techno nights | "techno nyc" | `/parties/techno` | Existing route | same | 39 | same | **P2** | Daily build |
| 27 | Reggaeton and Latin nights | "reggaeton party nyc" | `/parties/reggaeton`, `/parties/latin` | One combined guide only if the two lists differ little; otherwise keep both | same | 57 reggaeton, 63 Latin | Overlap unknown until published | **P2** | Daily build |
| 28 | Your first NYC club night: ID, dress codes and entry | first-timers, tourists | none | **New evergreen guide** built only from per-venue facts we hold (ID required, age, dress, re-entry, photo policy) with sources | venue facts | Age known for 601 of 606 nights; dress/re-entry for few | Dress codes mostly unknown; no generic claims | **P3** | Quarterly |
| 29 | What changed in NYC happy hours this month | returning readers, press | none | Monthly changelog generated from re-check diffs (new, changed, ended deals) | at least one full re-check cycle | **None yet**: nothing has been re-checked | Needs F2 re-check first | **HOLD** | Monthly |
| 30 | Late-night food near party venues | after the party | `/parties/venue/<id>` | Section on club pages | late opening hours near venues | opening hours known for 45% of bars | Too few verified late hours | **HOLD** | — |

## Recommended first batch (10 pages)

| Order | Page | Why first |
|---|---|---|
| 1 | **#9 Halloween** (+ #10 Brooklyn section): publish verified nights and improve `/parties/halloween` | Strongest and most time-limited intent; 141 records already re-checked today; the route exists and is ready. Every day of delay is lost before Oct 31. |
| 2 | **#1 + #7 Cheapest / $5 and under** on `/happy-hours/cheap-drinks` | Our data is the differentiator (313 bars with real prices); competitors list favourites, not prices. Needs the outlier check first. |
| 3 | **#6 Oysters** | Clear, price-driven intent; 22 bars with a per-oyster price make a real comparison table. |
| 4 | **#2 Late night** | Distinct answer (28 bars), easy to verify. |
| 5 | **#3 Saturday** | Distinct set (230), weekend demand. |
| 6 | **#4 Sunday** | Distinct set (262). |
| 7 | **#5 Food deals** | Large set (163) with priced items for a table. |
| 8 | **#15 Times Square** (one canonical answer) | Tourist intent; today three pages split it. Needs your decision on which URL answers. |
| 9 | **#14 Grand Central** | After-work intent; single existing page to improve. |
| 10 | **#13 Penn Station** (after consolidating the pair) | Same; needs your decision on the duplicate. |

None of the ten adds a new public route. Each improves a page that already exists and is already in the sitemap, so no URL, canonical or working page changes. Drafts will be written as unpublished files outside `site/src/pages` and outside the sitemap.

## Decisions needed from you

1. Approve (or edit) the first-batch list above.
2. Halloween: approve publishing nights that pass the gate (copy + sources + no blockers), or keep them as drafts for your review first.
3. Duplicates (audit F6): which URL should answer Times Square, Union Square and Penn Station; and what to do with the five weekday pages and `/weekend`. No redirect or noindex will be applied without this.
4. `/parties` while it has no published nights: `noindex` it, or leave it as it is until Halloween is published?
5. The freshness rules and the `needs_review` flag for outlier offers (audit F2, F3).
6. A daily rebuild (needed for #23 and for Halloween nights to leave the site on time). Cloudflare Workers Builds has no schedule; options are a GitHub Actions schedule with a Cloudflare token, or a Cloudflare deploy hook if your plan offers one.
