-- Schema for the NY happy Supabase project (ref zqfscuwkxcoktpjhaebv).
-- Tables were moved here from the "parents" project on 2026-10-13, data included.

create table public.h_verticals (
  slug text primary key,
  one_liner text not null,
  contract jsonb not null,
  table_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.h_runs (
  id bigserial primary key,
  vertical text references public.h_verticals(slug),
  started_at timestamptz default now(),
  finished_at timestamptz,
  stats jsonb,
  api_calls jsonb,
  notes text
);

create table public.h_nyc_happy_hour (
  id text primary key,
  slug text not null unique,
  name text not null,
  name_local text,
  category text,
  tags text[] not null default '{}'::text[],
  geo text,
  city text,
  address text,
  lat double precision,
  lng double precision,
  status text not null default 'pending' check (status in ('live','pending','rejected')),
  status_reason text,
  confidence numeric(3,2),
  is_chain boolean default false,
  facts jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  content jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  external_ids jsonb not null default '{}'::jsonb,
  first_seen timestamptz default now(),
  last_verified timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index h_nyc_hh_tags on public.h_nyc_happy_hour using gin (tags);
create index h_nyc_hh_facts on public.h_nyc_happy_hour using gin (facts);
create index h_nyc_hh_status on public.h_nyc_happy_hour (status, confidence desc);
create index h_nyc_hh_geo on public.h_nyc_happy_hour (geo);

create table public.nychh_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  session_id text not null,
  event text not null,
  props jsonb not null default '{}'::jsonb
);
create index nychh_events_ts on public.nychh_events (ts desc);
create index nychh_events_event on public.nychh_events (event, ts desc);
create index nychh_events_props on public.nychh_events using gin (props);

alter table public.h_verticals enable row level security;
alter table public.h_runs enable row level security;
alter table public.h_nyc_happy_hour enable row level security;
alter table public.nychh_events enable row level security;

create policy "public read live" on public.h_nyc_happy_hour for select using (status = 'live');
create policy "anon can log" on public.nychh_events for insert to anon with check (true);

create view public.nyc_happy_hour_readable with (security_invoker = true) as
 SELECT r.slug,
    r.name,
    r.geo AS neighborhood,
    r.address,
    r.status,
    r.status_reason,
    array_to_string(ARRAY( SELECT jsonb_array_elements_text((f.hh -> 'value'::text) -> 'days'::text) AS jsonb_array_elements_text), ', '::text) AS days,
    (f.hh -> 'value'::text) ->> 'start'::text AS hh_start,
    (f.hh -> 'value'::text) ->> 'end'::text AS hh_end,
    (f.hh -> 'value'::text) ->> 'deal_text'::text AS deal_text,
    (f.hh -> 'value'::text) ->> 'drinks_discount'::text AS drinks_discount,
    (f.hh -> 'value'::text) ->> 'food_discount'::text AS food_discount,
    ((f.hh -> 'value'::text) ->> 'two_for_one'::text)::boolean AS two_for_one,
    ((f.hh -> 'value'::text) ->> 'has_food'::text)::boolean AS has_food,
    ( SELECT string_agg(((x.o ->> 'item'::text) || ' '::text) || (x.o ->> 'price'::text), ' | '::text ORDER BY x.ord) AS string_agg
           FROM jsonb_array_elements(COALESCE((f.hh -> 'value'::text) -> 'offers'::text, '[]'::jsonb)) WITH ORDINALITY x(o, ord)) AS offers,
    jsonb_array_length(COALESCE((f.hh -> 'value'::text) -> 'offers'::text, '[]'::jsonb)) AS offer_count,
    ( SELECT string_agg((((array_to_string(ARRAY( SELECT jsonb_array_elements_text(w.value -> 'days'::text) AS jsonb_array_elements_text), ','::text) || ' '::text) || (w.value ->> 'start'::text)) || '-'::text) || (w.value ->> 'end'::text), ' ; '::text) AS string_agg
           FROM jsonb_array_elements(COALESCE((f.hh -> 'value'::text) -> 'windows'::text, '[]'::jsonb)) w(value)) AS all_windows,
    f.hh ->> 'evidence'::text AS evidence,
    f.hh ->> 'source_url'::text AS source_url,
    (f.hh ->> 'verified_at'::text)::timestamp with time zone AS read_on,
    (f.hh ->> 'confidence'::text)::numeric AS hh_confidence,
    (r.facts -> 'phone'::text) ->> 'value'::text AS phone,
    ((r.facts -> 'subway'::text) -> 'value'::text) ->> 'station'::text AS subway_station,
    ((r.facts -> 'licensed'::text) -> 'value'::text) ->> 'type'::text AS liquor_licence,
    r.raw ->> 'site'::text AS website,
    r.lat,
    r.lng,
    r.tags,
    r.confidence
   FROM public.h_nyc_happy_hour r
     LEFT JOIN LATERAL ( SELECT r.facts -> 'happy_hour'::text AS hh) f ON true;

comment on view public.nyc_happy_hour_readable is 'Flattened view of h_nyc_happy_hour: the happy hour fields live inside the facts JSONB column, and this spreads them into real columns for browsing in the dashboard. Read-only.';
