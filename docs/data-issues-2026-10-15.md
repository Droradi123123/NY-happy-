# Data issues found while writing copy (2026-10-15)

Reported by the copy agents; not yet fixed. Fix through the party_*/bar_* functions.

## From bar batch 2
- talavera-cantina-east-harlem: address 43 Bruckner Blvd (Mott Haven, Bronx) but hood East Harlem
- boqueria-spanish-tapas-flatiron: booking URL is an Atlanta Resy page
- lucky-tiger-financial-district: booking URL venues/toraya-bar (another venue)
- mezze-on-the-river-financial-district: 375 S End Ave = Battery Park City
- lovers-of-today-east-village: window 02:00-04:00 Sun-Wed (odd)
- ben-jack-s-steakhouse-flatiron: subway 1 at 28th St for 255 5th Ave (wrong coords?)
- sen-nyc-flatiron: C/E 23rd St for 12 W 21st St (wrong coords?)
- many bars without address; windows with start None
- coco-chinese-restaurant-crown-heights category bar
## From bar batch 4
- rosa-mexicano-hell-s-kitchen: 44 W 63rd St = Lincoln Square (UWS), not Hell's Kitchen
- yummy-yummy-jackson-heights, ovidio-s-bar-jackson-heights: Woodside
- edgewater-waterfront-hell-s-kitchen: Edgewater NJ! (booking URL) -> not NYC
- verdello-harlem (Manhattan Valley), the-heights-bar-grill-harlem (Morningside Heights)
- terraza-7, gilda-s, boca-chica, bistro-eloise "jackson heights": Elmhurst/East Elmhurst/Corona
- garbled names: sesamo..., "Tara Mor | NYC", "Jackson's Eatery | Bar"; garbled offers jack-demsey-s, tavern29
- booking links odd: r40 newline, glass-ceiling brunch page, stella-34 wine event
- start time "open" strings; categories wrong (Nagaiki Ramen, Raices Colombianas)
## Venue hoods (party batch 6)
- public-records -> Gowanus; brooklyn-storehouse -> Brooklyn Navy Yard; marquee-skydeck-at-edge-hudson-yards -> Hudson Yards; white-horse-tavern -> West Village
- the-onyx-room-at-house-of-yes separate venue row (room of house-of-yes)
- NYE Superior Ingredients: Room/Roof/All Access possible duplicates

## Parties (wave 1)
- NYE theme rule misfires: Funk Tribu (10/17), Kein Klub (11/06), Bangerangerz (11/14) carry 'nye'
- Held in review on purpose: Boo! at the Zoo (Oberon, night_date likely wrong), LES Killshot crawl (venue Sour Mouse not a participant), Superior Ingredients Lukas & Frank (room), AFROBEATS HAPPY HOUR (date conflict), Nebula Yacht Party (venue is the after-party club), Times Square passes (no venue / age), All Access Williamsburg NYE (multi-venue pass)
- Venue neighborhoods to correct: public-records -> Gowanus; brooklyn-storehouse -> Brooklyn Navy Yard; marquee-skydeck-at-edge-hudson-yards -> Hudson Yards; white-horse-tavern -> West Village; somewhere-nowhere-nyc -> Chelsea; darling-rooftop -> Central Park South; common-ground-bar -> Meatpacking District; c-mon-everybody -> Clinton Hill (border); bogart-house -> East Williamsburg
- margaritaville-landshark zip 10019 should be 10018

## Address check (NYC Planning GeoSearch), Oct 15 afternoon

Done: 112 bars moved to the right neighborhood, 6 coordinates moved, 78 more bars given a
neighborhood that was missing from `nyc_hoods` (Kips Bay, Clinton Hill, Battery Park City,
Morningside Heights, NoHo, Elmhurst, Flatbush and others, 36 added). Hamilton Heights stays
under Harlem. Every change is in `geo_fix_log`; the lookups are in `geo_check`.
Prospect Heights, Gowanus, Jackson Heights and Forest Hills fell under 5 bars and redirect
(site/public/_redirects). 12 New Jersey bars, Edgewater Waterfront and a duplicate Bartley's
were taken off the site (status rejected, with a reason).

Still open:
- Subway to recompute: bar-goto (lists Bergen St, Brooklyn), the-ox-tavern, little-biggs,
  mollusca, ofcorsica, ngon-vietnamese, milk-and-roses (Vernon Blvd, Queens), cafe-luce,
  sen-nyc (C/E for a Fifth Ave address), ben-jack-s and sol-mexican (1 train for Fifth Ave).
- Deal text copied from another location: blue-ribbon-sushi-bar (22 Vanderbilt), bondi-sushi
  (Ft. Lauderdale), novecento (Delray), boqueria-spanish-tapas (Dupont Circle, DC),
  market-bar (1206 Nostrand Ave), rangoon (Chelsea menu on a Crown Heights bar),
  stella-artois-flatiron, isla-co (LES text).
- Expired or not a happy hour: chelsea-ristorante-italiano (summer prix fixe to Sep 7),
  lure-fishbar and the-little-owl (breakfast), west-bank-cafe (dinner menu),
  the-happiest-hour (Sydney text), forno-doro (casino spam).
- Days stored differ from the bar's own text: jalopy-tavern, evalyn-s-tap-house, sen-nyc,
  at-the-office-bar, pongal, seven-sins, massawa, the-heights-bar-grill, boqueria,
  white-oak-tavern (no Thursday), ashford-simpson-s-sugar-bar (reversed), otb, bob-s-your-uncle,
  mayahuel-astoria, alfie-s, sesamo, greenwich-treehouse, cafe-luna, dive-bar-bk.
- Shared addresses (duplicate or wrong): lolita/valerie (45 W 45th), the-ainsworth/garage-sale
  (122 W 26th), el-lugar-cantina/the-wilson (132 W 27th), keybar/soup-queen (143 Troutman),
  bkb-brooklyn-brasserie/mama-fox (327 Stuyvesant), walters/karasu (166 DeKalb, may be right).
- Booking links to the wrong place: generic widgets.resy.com (emmy-squared, bua, layla,
  kent-ale-house), amelie (SF), l-antica-pizzeria (LA), spicy-moon (Bowery), the-malt-house,
  azul-on-the-rooftop (Felix Roasting Co).
- 61 bars have no address; 4 have no coordinates.
- Parties: teksupport-circoloco Oct 31 "SOLD OUT" in title but scheduled; three identical
  Liberty Belle cruises on Oct 31; Baccarat Hotel tagged Times Square; MOGUAI "Hallowen".
