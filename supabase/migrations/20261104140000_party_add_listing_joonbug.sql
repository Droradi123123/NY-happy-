-- Joonbug (joonbug.com) as a listing vendor: its NYC holiday pages carry schema.org Event data per night (on an
-- event page, inside WebPage.mainEntity). Key = the event's slug (joonbug.com/<city>/<section>/<slug>). Everything
-- else as for the other vendors (facts source_listed, 7-day re-read rule through listing_read_at). Its robots.txt
-- asks for 10 seconds between requests. (Applied 2026-11-04 through the Supabase connection.)
do $m$
declare d text;
begin
  d := pg_get_functiondef('public.party_add_listing(jsonb)'::regprocedure);
  d := replace(d, $a$('RA', 'Eventbrite', 'Shotgun', 'Venue')$a$, $a$('RA', 'Eventbrite', 'Shotgun', 'Joonbug', 'Venue')$a$);
  d := replace(d, 'vendor must be RA, Eventbrite, Shotgun or Venue', 'vendor must be RA, Eventbrite, Shotgun, Joonbug or Venue');
  d := replace(d, $a$    else left(md5(url), 16) end;$a$, $a$    when 'Joonbug' then (regexp_match(url, 'joonbug\.com/[a-z]+/[a-z-]+/([a-z0-9-]+)'))[1]
    else left(md5(url), 16) end;$a$);
  if d not like '%''Joonbug'' then%' then raise exception 'party_add_listing did not take the Joonbug change'; end if;
  execute d;
end $m$;
