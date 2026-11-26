# Growth log

One entry per weekly growth run (scheduled Claude session, Mondays). Aggregates only: this repository is
public, so no search queries, no visitor data and no raw rows go here (those stay in the encrypted report).

## 2026-11-26 (full UX and SEO pass)

- Method: two audits of a full build with live data (3,435 pages): every page type at 390px and 1280px, and a
  technical SEO crawl of the built HTML (titles, canonicals, markup, link graph, performance).
- Already sound (left alone): 0 duplicate or missing titles and descriptions, self-referencing canonicals everywhere,
  both sitemaps exact, 0 broken internal links, lab LCP 0.5 to 0.75 s and CLS 0.
- UX, measured on a phone: the first card or main button sat far below the first screen on most page types. After:
  neighborhood happy hour lists ~5,600px -> ~520px, New Year's Eve list 2,282 -> 547, date pages 1,267 -> 525, the
  ticket button on a party page ~770 (below the fold on ~70% of pages) -> ~600 with the sticky bar from the start.
  Cards keep the price and ticket button after "Show more"; attractions use the two-column grid; the guides index
  is grouped; /parties/tonight, /parties and the home page lead with the parties (owner request).
- SEO and answers: event markup dates were UTC (439 of 497 nights carried the next day's date, every New Year's Eve
  night said Jan 1), now New York time with offset; 20 nights had an end before their start (their pages left the
  site before doors); "This night is over" sat hidden in the HTML of every upcoming night; price 0 in markup for
  nights with no listed price; guides named 26 attractions and linked none (allowlist); attraction pages had 2
  internal links each and no hours or admission in the title; /happy-hours/now had no list in its HTML and
  robots.txt blocked the data the lists render from. All fixed in this pass.
- Also fixed on the way: a blog link to an ended night failed every build on Nov 26 (the 4-hourly rebuild too).
- Open, for the owner or a next pass: the Google focus list is 72% pages with 0 views in 28 days (278 bars shown
  once); 11 Halloween slice pages that held ~26% of recent Google impressions are noindex until next season; ended
  party redirects reach Cloudflare's static limit around Feb-Mar 2027; near-page titles cut mid-phrase (need Search
  Console positions first); Organization markup has no profiles to point to.

## 2026-11-23 (weekly run)

- Data (GA4 28 days to Nov 22): ~6,780 sessions (Nov 16: ~6,940, as the Halloween peak leaves the window);
  ChatGPT ~5,350 (79%), direct ~1,210, organic search ~66 (Google ~27, Bing ~23). Daily sessions ~110 to 145 on
  Nov 9-12, ~120 to 175 on Nov 16-20, ~270 on Sat Nov 21. Ticket clicks ~1,980 from ~1,330 users.
  ChatGPT landings: party pages and lists ~3,420, Halloween ~1,190 (still), New Year's Eve list ~140 plus the NYE
  guide ~30, Thanksgiving lists ~65, club pages ~95, December and Christmas guides ~20.
- Google (Search Console, 28 days to Nov 21): 141 impressions and 17 clicks (the 28 days before: ~8,330 and 108);
  0 to 4 impressions a day, no recovery yet. Bing: 335 -> 566 pages indexed (Nov 15 to Nov 22), 15 to 105
  impressions a day, 0 to 3 clicks a day, crawl about 780 pages a day.
- Opportunities: (1) holiday intent drives ChatGPT landings (Halloween still ~1,190 three weeks on); Christmas is
  the next holiday and had no "what's open" answer; (2) Bing is indexing fast (+231 pages in a week): every list
  and date page it sees needs real nights; (3) Google still needs links, not pages.
- Inventory (published, next 60 days): 474 nights; New Year's Eve 98; Dec 24-26: 19; Thanksgiving week 99.
- Shipped: "What's open on Christmas in NYC" (/blog/whats-open-on-christmas-nyc, keyword "what's open on christmas
  in nyc"): 20 attractions whose official hours say they close on Christmas Day, 2 that close early on Christmas
  Eve, 5 holiday sights with 2026 dates that include it, 21 parties Dec 24 to 27; in Google's focus list.
- Watch: Bing index and clicks, ChatGPT landings on the Christmas and New Year's Eve pages, any Google crawl.

## 2026-11-16 (weekly run)

- Data (GA4 28 days to Nov 15): ~6,940 sessions (Nov 9: ~5,900; Nov 10: ~6,040); ChatGPT ~5,370 (77%), direct ~1,260,
  Google organic ~130. Daily sessions ~220 on Nov 13-14 against ~100-155 in early November. Ticket clicks ~2,050
  (Nov 10: ~1,830). ChatGPT landings: party pages ~2,370 (Nov 10: ~1,780), Halloween ~1,210, party lists ~840,
  date pages ~390 (Nov 10: ~255; Dec 31 already ~48), guides ~210, /parties/tonight ~150.
- Google (Search Console, 28 days to Nov 14): still 0 to 4 impressions a day since Oct 25; the focus list (Nov 14)
  has not been crawled yet. Bing: 189 -> 272 pages indexed (Nov 9 to Nov 14), 15 to 34 impressions a day Nov 12-14.
- Opportunities: (1) ChatGPT party-page landings grow with inventory (553 -> 564 published upcoming); (2) holiday
  intent: date pages and the New Year's Eve pages rise before the holidays, Thanksgiving week has 85 nights;
  (3) the two Thanksgiving blog posts written in October still quote their October counts (40 and 7 nights).
- Shipped: "What's open on Thanksgiving in NYC" (/blog/whats-open-on-thanksgiving-nyc, keyword "what's open on
  thanksgiving in nyc"): 19 attractions whose official hours say they close that day, 6 holiday sights in season that
  weekend (closures and select-date runs flagged), 85 parties Nov 25 to 29; in Google's focus list.
- Watch: Google crawl of the focus list, Bing index, ChatGPT landings on the Thanksgiving and New Year's Eve pages.

## 2026-11-15 (inventory push)

- Parties: 112 new nights published Dec 2026 to Mar 2027 (Eventbrite 67, venue calendars and DICE 38, DICE wide scan 7);
  553 upcoming published (311 in the next 30 days, 92 New Year's Eve). DICE discovery can now scan 16 weeks of
  browse pages by hand (inputs horizon_days, browse_weeks, browse_dows).
- Copy: "about" opens with who, what, where and when in one sentence; 4-5 pre-purchase FAQs. Snippet fix: a sentence
  no longer ends at an initial ("J. Worra"); titles drop listing asterisks.
- Attractions: 129 live (27 added by demand, Wikipedia pageviews as the proxy; Google Trends refuses automated
  reads), including the 2026 holiday season; 18 new photos.
- Note: a manual run of deploy-site.yml only builds and checks. The live site is built by Cloudflare on every push
  and by the scheduled rebuild hook every 4 hours.

## 2026-11-14 (Google focus)

- Data (Search Console, 28 days to Nov 12): ~1,000 Google impressions a day from Oct 16 to Oct 24 (122 clicks,
  position ~10), then ~3 a day from Oct 25 on, with no site change that day. Index sample (Nov 9): 11 of 115 pages
  indexed, most last crawled Oct 15-20; sitemap.xml last read Oct 23. Bing: 1 -> 189 pages indexed (Oct 18 to Nov 9),
  impressions peaked at ~530 a day around Halloween. GA4 28 days: ~6,340 sessions, AI assistants ~4,900, organic ~140.
- Reading: Google tested the new domain for ten days and then judged it on its average page (~1,150 mostly templated
  pages, no links in). The limit is trust and links, not page count.
- Shipped: Google focus (lib/googleFocus.ts). Google alone is shown every page it has already shown (kept), the hubs
  and data pages, the holiday lists, the attraction hub and categories and 40 best-known attractions; every other
  page gets "googlebot: noindex, follow" and leaves sitemap.xml. Bing, IndexNow and ChatGPT search keep every
  indexable page (sitemap-full.xml). Also: 48 attractions added (99 -> 102 live with the Cloisters, the Morgan and
  Carnegie Hall), 55 new party nights.
- Owner to do: check Manual actions in Search Console; request indexing for the key pages; resubmit sitemap.xml.
- Watch: Google crawl dates and the index sample (index-check), impressions per day, inbound links.

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
