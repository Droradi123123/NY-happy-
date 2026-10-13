-- What yaynyc.com reads at build time, plus the "report a change" inbox.
-- Applied to the NY happy project as two migrations: site_views and site_reports.

create table public.nyc_hoods (
  name text primary key,
  slug text not null unique,
  borough text not null check (borough in ('Manhattan','Brooklyn','Queens','The Bronx','Staten Island'))
);
alter table public.nyc_hoods enable row level security;
create policy "public read hoods" on public.nyc_hoods for select using (true);
insert into public.nyc_hoods (name, slug, borough) values
('Williamsburg','williamsburg','Brooklyn'),('East Village','east-village','Manhattan'),('Upper West Side','upper-west-side','Manhattan'),
('Times Square','times-square','Manhattan'),('Greenwich Village','greenwich-village','Manhattan'),('Upper East Side','upper-east-side','Manhattan'),
('Hell''s Kitchen','hells-kitchen','Manhattan'),('Astoria','astoria','Queens'),('Koreatown','koreatown','Manhattan'),('Murray Hill','murray-hill','Manhattan'),
('West Village','west-village','Manhattan'),('Park Slope','park-slope','Brooklyn'),('Lower East Side','lower-east-side','Manhattan'),
('Financial District','financial-district','Manhattan'),('Midtown','midtown','Manhattan'),('Flatiron','flatiron','Manhattan'),('Nolita','nolita','Manhattan'),
('Bushwick','bushwick','Brooklyn'),('Tribeca','tribeca','Manhattan'),('Gramercy','gramercy','Manhattan'),('SoHo','soho','Manhattan'),('Chelsea','chelsea','Manhattan'),
('Prospect Heights','prospect-heights','Brooklyn'),('Harlem','harlem','Manhattan'),('Jackson Heights','jackson-heights','Queens'),('Greenpoint','greenpoint','Brooklyn'),
('Cobble Hill','cobble-hill','Brooklyn'),('Fort Greene','fort-greene','Brooklyn'),('Staten Island','staten-island','Staten Island'),('Union Square','union-square','Manhattan'),
('Bed-Stuy','bed-stuy','Brooklyn'),('East Harlem','east-harlem','Manhattan'),('Long Island City','long-island-city','Queens'),('Ridgewood','ridgewood','Queens'),
('Queens','queens','Queens'),('Crown Heights','crown-heights','Brooklyn'),('Gowanus','gowanus','Brooklyn'),('Forest Hills','forest-hills','Queens'),
('Carroll Gardens','carroll-gardens','Brooklyn'),('Washington Heights','washington-heights','Manhattan'),('Bay Ridge','bay-ridge','Brooklyn'),('Inwood','inwood','Manhattan'),
('Sunnyside','sunnyside','Queens'),('Brooklyn','brooklyn','Brooklyn'),('The Bronx','the-bronx','The Bronx'),('Downtown Brooklyn','downtown-brooklyn','Brooklyn'),
('Red Hook','red-hook','Brooklyn'),('Flushing','flushing','Queens'),('Brooklyn Heights','brooklyn-heights','Brooklyn'),('Sunset Park','sunset-park','Brooklyn'),
('Chinatown','chinatown','Manhattan'),('Lenox Hill','lenox-hill','Manhattan');

-- anon key; RLS on the base tables still applies: only live bars, only published parties, only active venues
create view public.site_bars with (security_invoker = true) as
select b.slug, b.name, b.category, b.tags, b.geo as hood, coalesce(h.slug, 'nyc') as hood_slug, h.borough,
  b.address, b.lat, b.lng, b.is_chain, b.confidence, b.last_verified,
  b.facts->'happy_hour'->'value' as hh,
  b.facts->'happy_hour'->>'source_url' as hh_source,
  b.facts->'happy_hour'->>'verified_at' as hh_checked,
  b.facts->'subway'->'value' as subway,
  b.facts->'opening_hours'->'value' as hours,
  b.facts->'phone'->>'value' as phone,
  b.facts->'booking'->>'value' as booking,
  b.facts->'instagram'->>'value' as instagram,
  b.facts->'price_range'->'value' as price_range,
  b.facts->'cuisine'->'value' as cuisine,
  b.facts->'licensed'->'value'->>'type' as licence,
  b.raw->>'site' as website
from public.h_nyc_happy_hour b left join public.nyc_hoods h on h.name = b.geo
where b.status = 'live';

create view public.site_parties with (security_invoker = true) as
select e.slug, e.title, e.starts_at, e.ends_at, e.doors_at, e.night_date, e.event_status, e.venue_id, e.room,
  e.borough, e.neighborhood, e.age_min, e.price_from, e.price_to, e.price_status, e.genres, e.themes, e.performers,
  e.organizer, e.ticket_url, e.ticket_vendor, e.refund_terms, e.copy, e.last_checked,
  (select jsonb_object_agg(k, v->'value') from jsonb_each(e.facts) f(k, v)
     where k in ('multi_day','set_times','door_sales','concept','dress','entrance','reentry','id_required','photo_policy','accessibility','room','lineup_note')) as extra,
  (select jsonb_agg(jsonb_build_object('name', s->>'name', 'url', s->>'url', 'checked_at', s->>'checked_at')) from jsonb_array_elements(e.sources) s) as sources
from public.party_events e
where e.publish_status = 'published';

create view public.site_venues with (security_invoker = true) as
select id, name, rooms, address, borough, neighborhood, lat, lng, kind, copy,
  (select jsonb_object_agg(k, v->'value') from jsonb_each(facts) f(k, v) where k in ('website','phone','hours','accessibility','google_type')) as extra
from public.party_venues where status = 'active' and coalesce(kind, '') <> 'placeholder';

grant select on public.site_bars, public.site_parties, public.site_venues, public.nyc_hoods to anon, authenticated;

-- "Report a change / add a place" from the site: anyone may write, nobody may read from the site
create table public.site_reports (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('correction','new_place','new_party','closed','business','other')),
  page text check (length(page) <= 300),
  place text check (length(place) <= 200),
  details text not null check (length(details) between 5 and 3000),
  contact text check (length(contact) <= 200),
  handled boolean not null default false
);
alter table public.site_reports enable row level security;
create policy "anyone can report" on public.site_reports for insert to anon with check (handled = false);
grant insert on public.site_reports to anon;
grant usage on sequence public.site_reports_id_seq to anon;
