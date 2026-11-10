# Growth log

One entry per weekly growth run (scheduled Claude session, Mondays). Aggregates only: this repository is
public, so no search queries, no visitor data and no raw rows go here (those stay in the encrypted report).

## 2026-11-10 (full SEO and AEO audit)

- Data (28 days to Nov 9): ~6,040 sessions; AI assistants ~77% (ChatGPT ~4,800), direct ~19%, Google ~2%.
  ChatGPT lands on single party pages (~1,780 sessions on ~310 pages; ~1,420 of the ~1,830 ticket clicks),
  Halloween pages (~1,720), party lists (~670 on ~75 pages) and date pages (~255 on 14 pages, about 18 a page).
  Google: 1 to 6 impressions a day since Oct 25; Bing: ~59 pages indexed; 0 inbound links on both.
- Main finding: the index rules written for Google's pruning also said "noindex" to every other engine. Of 2,932
  built pages, 141 written-up party nights (most of New Year's Eve), 197 club pages, 374 party lists and 19 date
  pages were closed to ChatGPT search and Bing, the engines that bring the traffic.
- Shipped: two audiences. Every written-up night, every club with a night coming up, every list and date page with
  3+ nights is indexable; Google alone keeps its narrow core. sitemap-full 1,263 -> 1,543 pages (Google's ~1,130,
  unchanged). Date pages for every night in the next 60 days with 3+ parties, with "the night at a glance".
  New lists: genre x this weekend / tonight, 18+. The Halloween hub is a season-in-numbers page after the season
  (was "0 parties", noindex). Party titles: no repeated venue, New Year's Eve named where the listing title is only
  the venue, long titles fit 60 characters. Event image and og:image from the venue's own photo.
- Fixed on the way: "tickets from $0" on lists and date pages; happy hours offered on a date page run on that weekday;
  two cruises by one promoter shared a title.
- Watch next week: Bing indexed count, ChatGPT landings on date pages and NYE party pages, sitemap-full coverage.

## 2026-11-09

- Data (28 days to Nov 8): ~5,900 sessions; AI assistants (ChatGPT) ~77%, direct ~19%, Google organic ~2%. ChatGPT
  landings: holiday pages ~2,450, single party pages ~1,700, happy-hour pages ~100. ChatGPT sessions peaked at ~790
  a day on Halloween and run ~110 to 160 a day since. Google impressions still 1 to 6 a day since Oct 25; Bing indexes
  ~59 pages; 0 inbound links on both.
- Shipped: NYC New Year's Eve Price Index (/nyc-nye-price-index, CSV) with a daily price watch (party_price_snapshots,
  pg_cron yay-price-snapshot, from Nov 9); /press (citable numbers); "Listed on YaY NYC" badge (/listed, linked from
  every party page); NYE slices under-100 and times-square; DICE discovery now scans DICE's NYC listings by date and
  reads Eventbrite/Joonbug prices.
- Inventory: NYE published 34 -> 64, Thanksgiving Eve 11 -> 17, plus December holiday nights; 29 duplicate rows rejected.
- Outreach prepared (sent by the owner): four press pitches as Gmail drafts; a promoter list with badge links.
- Not changed on purpose: the Google sitemap (pruned Oct 31 and Nov 6). Google's limit is trust (no links), not page
  count; re-check in two weeks with the links from press and promoters.
- Watch next week: NYE nights and price changes, press replies and any inbound links, ChatGPT landings on NYE pages.
- Weekly run (same data): 3 biggest openings: (1) holiday pages, ~2,450 of ChatGPT's landings in 28 days, NYE next;
  (2) bar pages at Google positions 5 to 12 with a 0.5% click rate (305 pages, 3,339 impressions, 17 clicks in 90 days);
  (3) ticket clicks, ~1,830 from ~1,200 users in 28 days. Shipped for (2): bar titles lead with the cheapest drink and
  the hours read on the bar's own site (405 bars); the one bar page in Google's top 3 keeps its title.

## 2026-11-04 (baseline)

- Google: impressions rose from 0 to about 1,100 a day between Oct 15 and Oct 24, then fell to 5 to 30 a day
  from Oct 25 and stayed there. Not technical: URL Inspection shows fetch successful, robots and indexing
  allowed; 10 of 100 sampled pages indexed, most "crawled, currently not indexed". Read as a quality
  demotion of a new domain that launched ~2,000 templated pages; weak pages were noindexed (Nov 1-2).
  Recovery needs original pages, inbound links (none yet) and time.
- GA4, 28 days: ~5,200 sessions; ChatGPT ~77% of sessions, direct ~18%, Google organic ~2%.
  ChatGPT lands on single party pages (~1,700) and holiday pages (~1,400); blog pages ~150.
  Ticket clicks ~1,700 from ~1,080 users. Peak hours 7 to 11 pm, Friday and Saturday.
- Bing: ~50 pages indexed, 0 inbound links; the daily 100-URL submission resent the same 100 pages
  (fixed Nov 4: hubs daily, the rest rotating).
- Shipped this week: afrobeats, reggaeton and EDM club guides; weeknight and neighborhood nightlife guides;
  venue pages with stats, past nights and house rules; 50+ new party nights incl. NYE and Thanksgiving Eve.
- Watch next week: Google impressions trend, Bing indexed count, ChatGPT sessions vs the Halloween peak,
  NYE and Thanksgiving pages' landings.
