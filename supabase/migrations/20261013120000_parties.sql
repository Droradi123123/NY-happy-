-- NYC parties: tables, rules and the refresh pipeline (project zqfscuwkxcoktpjhaebv).
-- Applied on 2026-10-13 in several steps; this file is the combined result.
-- Requires: pg_net, pg_trgm and unaccent (schema extensions), supabase_vault.
--
-- Every fact keeps where it came from, when it was read and how sure we are:
--   facts.<field> = {value, src, url, checked_at, status}
--   status: verified | source_listed | derived | conflict | missing
-- Plain UPDATE/DELETE through the Supabase MCP waits for a human confirmation, so all
-- writes go through the party_* functions below.

create extension if not exists pg_net;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table public.party_sources (
  slug text primary key,
  name text not null,
  url text not null,
  tier text not null check (tier in ('rich','diversity','seasonal','discovery')),
  kind text not null check (kind in ('ticketing','venue','promoter','listing','editorial','community')),
  fetch_via text not null check (fetch_via in ('pg_net','blocked','spa','manual')),
  structured text,
  strengths text,
  cautions text,
  rights_status text not null default 'unverified',
  last_checked timestamptz,
  notes text
);

create table public.party_venues (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  rooms text[] not null default '{}',
  address text,
  zip text,
  borough text,
  neighborhood text,
  lat double precision,
  lng double precision,
  kind text,
  facts jsonb not null default '{}'::jsonb,
  copy jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','closed','unknown')),
  google_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.party_events (
  id text primary key,
  slug text not null unique,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  doors_at timestamptz,
  night_date date,
  event_status text not null default 'scheduled' check (event_status in ('scheduled','postponed','rescheduled','cancelled','sold_out')),
  venue_id text references public.party_venues(id),
  room text,
  borough text,
  neighborhood text,
  age_min int,
  price_from numeric(8,2),
  price_to numeric(8,2),
  price_status text not null default 'unknown' check (price_status in ('priced','free','unknown')),
  category text,
  genres text[] not null default '{}',
  themes text[] not null default '{}',
  performers text[] not null default '{}',
  organizer text,
  ticket_url text,
  ticket_vendor text,
  refund_terms text,
  facts jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  copy jsonb not null default '{}'::jsonb,
  publish_status text not null default 'draft' check (publish_status in ('draft','review','ready','published','rejected','ended')),
  review_reason text,
  first_seen timestamptz default now(),
  last_checked timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index party_events_night on public.party_events (night_date);
create index party_events_publish on public.party_events (publish_status, night_date);
create index party_events_venue on public.party_events (venue_id, night_date);
create index party_events_themes on public.party_events using gin (themes);
create index party_events_genres on public.party_events using gin (genres);
create index party_events_title_trgm on public.party_events using gin (title extensions.gin_trgm_ops);

create table public.party_leads (
  id bigserial primary key,
  source text not null,
  date_text text,
  night_date date,
  time_text text,
  title text not null,
  venue_text text,
  url text,
  match_status text,
  matched_event_id text references public.party_events(id),
  status text not null default 'open' check (status in ('open','merged','promoted','rejected')),
  notes text,
  checked_at timestamptz,
  created_at timestamptz default now()
);

create table public.party_runs (
  id bigserial primary key,
  started_at timestamptz default now(),
  finished_at timestamptz,
  kind text,
  stats jsonb,
  notes text
);

-- keyword rules for genres and tags: data, not code (the skill adds rules here)
create table public.party_rules (
  slug text not null,
  kind text not null check (kind in ('genre','tag')),
  pattern text not null,
  primary key (kind, slug)
);

-- pages asked of pg_net, so responses can be matched back to an event or venue
create table public.party_fetches (
  request_id bigint primary key,
  event_id text references public.party_events(id) on delete cascade,
  venue_id text references public.party_venues(id) on delete cascade,
  url text not null,
  kind text not null default 'dice',
  requested_at timestamptz default now(),
  done_at timestamptz,
  result text
);

alter table public.party_sources enable row level security;
alter table public.party_venues enable row level security;
alter table public.party_events enable row level security;
alter table public.party_leads enable row level security;
alter table public.party_runs enable row level security;
alter table public.party_rules enable row level security;
alter table public.party_fetches enable row level security;

-- the site reads published nights and active venues; nothing else is public
create policy "public read published" on public.party_events for select using (publish_status = 'published');
create policy "public read active venues" on public.party_venues for select using (status = 'active');

insert into public.party_rules (kind, slug, pattern) values
 ('genre','techno','\mtechno\M'), ('genre','house','\m(deep |tech |afro |latin )?house\M'), ('genre','disco','\mdisco\M|nu-disco'),
 ('genre','trance','\mtrance\M'), ('genre','drum-and-bass','drum ?(&|and|n)? ?bass|\mdnb\M|\mjungle\M'), ('genre','breaks','\mbreaks\M|breakbeat'),
 ('genre','afrobeats','afro ?beats?'), ('genre','amapiano','amapiano'), ('genre','afro-house','afro ?house'),
 ('genre','latin','\mlatin\M|salsa|bachata|merengue|cumbia'), ('genre','reggaeton','reggaet[oó]n|perreo|dembow'),
 ('genre','hip-hop','hip[ -]?hop|\mrap\M'), ('genre','r-and-b','r&b|\mrnb\M'), ('genre','dancehall','dancehall|\msoca\M'),
 ('genre','edm','\medm\M|dubstep|bass music'), ('genre','pop','\mpop\M|top ?40'), ('genre','emo','\memo\M|pop[- ]punk'),
 ('genre','80s','\m80''?s\M|eighties'), ('genre','90s','\m90''?s\M|nineties'), ('genre','2000s','\m2000''?s\M|\my2k\M'),
 ('genre','k-pop','k-?pop'), ('genre','jazz','\mjazz\M'), ('genre','funk-soul','\mfunk\M|\msoul\M|motown'),
 ('genre','experimental','experimental|\mambient\M|\mnoise\M'), ('genre','electro','\melectro\M'), ('genre','garage','\mgarage\M|\mukg\M'),
 ('tag','lgbtq','\mqueer\M|lgbt|\mgay\M|lesbian|\mtrans\M|\mdrag\M|\mpride\M'), ('tag','drag','\mdrag\M'),
 ('tag','rooftop','rooftop|\mroof\M|skydeck'), ('tag','day-party','day ?party|daytime|\mbrunch\M'), ('tag','open-decks','open ?decks?'),
 ('tag','boat','\myacht\M|\mboat\M|\mcruise\M'), ('tag','open-bar','open bar'), ('tag','costume','costume'),
 ('tag','sober','\msober\M|alcohol[- ]free'), ('tag','halloween','hallowe?en'), ('tag','nye','new year''?s eve|\mnye\M'),
 ('tag','thanksgiving','thanksgiving|blackout wednesday');

-- ---------- helpers ----------

create or replace function public.party_fact(v jsonb, url text, status text default 'source_listed', src text default 'dice', at timestamptz default now())
returns jsonb language sql immutable as $$
  select case when v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb
    then jsonb_build_object('value', null, 'status', 'missing', 'src', src, 'url', url, 'checked_at', at)
    else jsonb_build_object('value', v, 'status', status, 'src', src, 'url', url, 'checked_at', at) end
$$;

create or replace function public.party_match(p_kind text, txt text) returns text[] language sql stable as $$
  select coalesce(array_agg(r.slug order by r.slug), '{}') from public.party_rules r where r.kind = p_kind and lower(coalesce(txt,'')) ~* r.pattern
$$;

create or replace function public.party_slugify(t text) returns text language sql stable as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(t,''))), '&', ' and ', 'g'), '[^a-z0-9]+', '-', 'g'))
$$;

/** Night date in New York: a start before 6am belongs to the night before. */
create or replace function public.party_night(ts timestamptz) returns date language sql immutable as $$
  select ((ts at time zone 'America/New_York') - case when extract(hour from (ts at time zone 'America/New_York')) < 6 then interval '1 day' else interval '0' end)::date
$$;

-- ---------- DICE refresh ----------

/** Queue the DICE pages of up to n (max 40) upcoming events not read within older_than. */
create or replace function public.party_dice_request(n int default 30, older_than interval default '3 days')
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0;
begin
  for r in
    select e.id, e.ticket_url from party_events e
    where e.ticket_vendor = 'DICE' and e.ticket_url is not null
      and e.publish_status <> 'ended'
      and (e.night_date is null or e.night_date >= (now() at time zone 'America/New_York')::date - 1)
      and coalesce((e.raw->>'dice_read_at')::timestamptz, 'epoch'::timestamptz) < now() - older_than
      and not exists (select 1 from party_fetches f where f.event_id = e.id and f.done_at is null and f.requested_at > now() - interval '30 minutes')
    order by e.night_date nulls first, e.id
    limit least(n, 40)
  loop
    insert into party_fetches (request_id, event_id, url)
    values (net.http_get(url := r.ticket_url,
      headers := '{"User-Agent":"Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)"}'::jsonb,
      timeout_milliseconds := 30000), r.id, r.ticket_url);
    k := k + 1;
  end loop;
  return k;
end $$;

/**
 * Read every DICE page that came back and refresh its event. Each field keeps source and
 * time (facts). Our own work (copy, review decisions) is never overwritten; a cancelled or
 * changed event drops from ready/published to review. Nights that are over become 'ended'.
 * pg_net clears its own responses after a few hours, so nothing is removed here.
 */
create or replace function public.party_dice_ingest() returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  f record; resp record; st jsonb; ev jsonb; ld jsonb; e party_events; url text; at timestamptz := now();
  age int; lineup text[]; txt text; s_from numeric; s_to numeric; ok int := 0; bad int := 0; gone int := 0; ended int := 0;
  dstatus text; ldstatus text; new_slug text; start_ts timestamptz;
begin
  for f in select * from party_fetches where done_at is null and kind = 'dice' order by request_id loop
    select * into resp from net._http_response where id = f.request_id;
    if not found then
      if f.requested_at < now() - interval '2 hours' then
        update party_fetches set done_at = now(), result = 'no response' where request_id = f.request_id;
      end if;
      continue;
    end if;
    select * into e from party_events where id = f.event_id;
    url := f.url;
    if resp.status_code in (404, 410) then
      update party_events set event_status = 'cancelled', review_reason = 'DICE page gone (' || resp.status_code || ')',
        publish_status = case when publish_status in ('published','ready') then 'review' else publish_status end,
        facts = facts || jsonb_build_object('status', party_fact(to_jsonb('page gone'::text), url, 'source_listed', 'dice', at)),
        raw = raw || jsonb_build_object('dice_read_at', at), updated_at = now()
      where id = f.event_id;
      update party_fetches set done_at = now(), result = 'gone ' || resp.status_code where request_id = f.request_id;
      gone := gone + 1; continue;
    end if;
    begin
      st := ((((regexp_match(resp.content, '<script id="__NEXT_DATA__"[^>]*?>(.*?)</script>'))[1])::jsonb -> 'props' -> 'pageProps' ->> 'initialState')::jsonb) -> 'event';
      ld := ((regexp_match(resp.content, '<script[^>]*?application/ld\+json[^>]*?>(.*?)</script>'))[1])::jsonb;
      ev := st -> 'event';
      if ev is null then raise exception 'no event json (http %)', resp.status_code; end if;
    exception when others then
      update party_fetches set done_at = now(), result = 'parse error: ' || left(sqlerrm, 120) where request_id = f.request_id;
      bad := bad + 1; continue;
    end;

    start_ts := (ev->'dates'->>'event_start_date')::timestamptz;
    age := (select (regexp_match(h->>'title', '(\d+)\+'))[1]::int from jsonb_array_elements(coalesce(ev->'about'->'highlights','[]'::jsonb)) h where h->>'type' = 'age_restriction' limit 1);
    lineup := array(select x->>'name' from jsonb_array_elements(coalesce(st->'lineup','[]'::jsonb)) x where coalesce(x->>'name','') <> '');
    s_from := nullif(ld->'offers'->>'lowPrice','')::numeric;
    s_to := nullif(ld->'offers'->>'highPrice','')::numeric;
    if s_from is null and (ev->'price'->>'amount_from') is not null then s_from := (ev->'price'->>'amount_from')::numeric / 100; end if;
    ldstatus := replace(coalesce(ld->>'eventStatus',''), 'https://schema.org/', '');
    dstatus := case
      when ldstatus = 'EventCancelled' or ev->>'status' in ('cancelled','canceled') then 'cancelled'
      when ldstatus = 'EventPostponed' then 'postponed'
      when ldstatus = 'EventRescheduled' then 'rescheduled'
      when ev->>'status' in ('sold-out','sold_out') then 'sold_out'
      else 'scheduled' end;
    txt := coalesce(ev->>'name','') || ' ' || coalesce(ev->'about'->>'description','') || ' ' || array_to_string(lineup, ' ');

    -- the first good read gives a placeholder slug its permanent value: title + night
    new_slug := e.slug;
    if e.slug like 'dice-%' and start_ts is not null then
      new_slug := coalesce(nullif(left(party_slugify(split_part(split_part(ev->>'name', ' — ', 1), ' | ', 1)), 60), ''), 'party');
      new_slug := regexp_replace(new_slug, '-+$', '') || '-' || to_char(party_night(start_ts), 'YYYY-MM-DD');
      if exists (select 1 from party_events where slug = new_slug and id <> e.id) then new_slug := new_slug || '-' || right(e.id, 4); end if;
    end if;

    update party_events set
      slug = new_slug,
      title = coalesce(ev->>'name', title),
      starts_at = coalesce(start_ts, starts_at),
      ends_at = coalesce((ev->'dates'->>'event_end_date')::timestamptz, ends_at),
      doors_at = coalesce((ld->>'doorTime')::timestamptz, start_ts, doors_at),
      night_date = coalesce(party_night(start_ts), night_date),
      event_status = dstatus,
      age_min = coalesce(age, age_min),
      price_from = coalesce(s_from, price_from),
      price_to = coalesce(s_to, price_to),
      price_status = case when s_from > 0 then 'priced' else price_status end,
      performers = case when cardinality(lineup) > 0 then lineup else performers end,
      organizer = coalesce(ev->'billing_promoter'->>'name', nullif(regexp_replace(coalesce(ev->>'presented_by',''), '^Presented by\s*|\.$', '', 'g'), ''), organizer),
      genres = array(select distinct g from unnest(genres || party_match('genre', txt)) g order by g),
      themes = array(select distinct t from unnest(themes || array(select x from unnest(party_match('tag', txt)) x where x in ('halloween','nye','thanksgiving'))) t order by t),
      refund_terms = coalesce(case ev->'public_refund_policy'->>'type'
          when 'cooling_off_enabled' then 'DICE: refund within ' || (ev->'public_refund_policy'->>'hours') || ' hours of purchase (not within 24 hours of the event), or if the event is cancelled or rescheduled'
          when 'no_refunds' then 'DICE: no refunds unless the event is cancelled or rescheduled' end, refund_terms),
      facts = facts || jsonb_build_object(
        'title', party_fact(to_jsonb(ev->>'name'), url, 'source_listed', 'dice', at),
        'start', party_fact(ev->'dates'->'event_start_date', url, 'source_listed', 'dice', at),
        'end', party_fact(ev->'dates'->'event_end_date', url, 'source_listed', 'dice', at),
        'doors', party_fact(ld->'doorTime', url, 'source_listed', 'dice', at),
        'multi_day', party_fact(ev->'dates'->'is_multi_days_event', url, 'source_listed', 'dice', at),
        'status', party_fact(to_jsonb(dstatus), url, 'source_listed', 'dice', at),
        'age', party_fact(to_jsonb(age), url, 'source_listed', 'dice', at),
        'price', party_fact(case when s_from is not null then jsonb_build_object('from', s_from, 'to', s_to, 'currency', 'USD', 'note', 'lowest DICE ticket incl. fees when read') end, url, 'source_listed', 'dice', at),
        'performers', party_fact(to_jsonb(lineup), url, 'source_listed', 'dice', at),
        'set_times', party_fact((select jsonb_agg(jsonb_build_object('name', x->>'name', 'time', x->>'performing_time')) from jsonb_array_elements(coalesce(st->'lineup','[]'::jsonb)) x where x->>'performing_time' is not null), url, 'source_listed', 'dice', at),
        'organizer', party_fact(to_jsonb(coalesce(ev->'billing_promoter'->>'name', ev->>'presented_by')), url, 'source_listed', 'dice', at),
        'refund_policy', party_fact(ev->'public_refund_policy', url, 'source_listed', 'dice', at),
        'door_sales', party_fact(ev->'is_ticket_available_at_door', url, 'source_listed', 'dice', at),
        'sale_status', party_fact(ev->'status', url, 'source_listed', 'dice', at),
        'venue_name', party_fact(ld->'location'->'name', url, 'source_listed', 'dice', at),
        'venue_address', party_fact(ld->'location'->'address'->'streetAddress', url, 'source_listed', 'dice', at),
        'geo', party_fact(case when ld->'location'->'geo' is not null then jsonb_build_array(ld->'location'->'geo'->'latitude', ld->'location'->'geo'->'longitude') end, url, 'source_listed', 'dice', at),
        'dice_faqs', party_fact(nullif(ev->'faqs', '[]'::jsonb), url, 'source_listed', 'dice', at)),
      raw = raw || jsonb_build_object(
        'description', ev->'about'->>'description', 'highlights', ev->'about'->'highlights', 'dice_status', ev->>'status',
        'dice_tags', ev->'tags_types', 'images_source_only', ev->'images', 'sale_dates', ev->'dates', 'dice_read_at', at,
        'note', 'source text and images: never publication copy, never published'),
      sources = coalesce((select jsonb_agg(s) from jsonb_array_elements(sources) s where s->>'name' <> 'DICE'), '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('name', 'DICE', 'url', url, 'role', 'tickets', 'checked_at', at)),
      publish_status = case when dstatus in ('cancelled','postponed','rescheduled') and publish_status in ('published','ready') then 'review' else publish_status end,
      review_reason = case when dstatus in ('cancelled','postponed','rescheduled') then 'DICE status: ' || dstatus else review_reason end,
      last_checked = at, updated_at = at
    where id = f.event_id;

    if ld->'location'->'geo' is not null then
      update party_venues set lat = (ld->'location'->'geo'->>'latitude')::float8, lng = (ld->'location'->'geo'->>'longitude')::float8, updated_at = now()
      where id = e.venue_id and lat is null;
    end if;
    update party_fetches set done_at = now(), result = 'ok' where request_id = f.request_id;
    ok := ok + 1;
  end loop;

  -- a night that is over leaves the site for good (the HappyTLV rule)
  update party_events set publish_status = 'ended', updated_at = now()
  where publish_status <> 'ended' and coalesce(ends_at, starts_at + interval '6 hours') < now() - interval '2 hours';
  get diagnostics ended = row_count;

  return jsonb_build_object('read', ok, 'unreadable', bad, 'gone', gone, 'ended_now', ended,
    'waiting', (select count(*) from party_fetches where done_at is null and kind = 'dice'));
end $$;

/** Add one DICE event by its URL; the page is queued at once and party_dice_ingest() fills the rest. */
create or replace function public.party_add_dice(p_url text, p_venue_id text, p_room text default null, p_found_via text default null, p_themes text[] default '{}')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare eid text; key text;
begin
  key := (regexp_match(p_url, 'dice\.fm/event/([^/?#]+)'))[1];
  if key is null then raise exception 'not a DICE event URL: %', p_url; end if;
  if not exists (select 1 from party_venues where id = p_venue_id) then raise exception 'unknown venue %: add it to party_venues first', p_venue_id; end if;
  eid := 'dice:' || key;
  insert into party_events (id, slug, title, venue_id, room, borough, themes, ticket_url, ticket_vendor, sources, raw, publish_status, first_seen)
  select eid, 'dice-' || key, '(reading from DICE)', p_venue_id, p_room, v.borough, p_themes, 'https://dice.fm/event/' || key, 'DICE',
    jsonb_build_array(jsonb_build_object('name', 'DICE', 'url', 'https://dice.fm/event/' || key, 'role', 'tickets', 'checked_at', now()))
      || case when p_found_via is not null then jsonb_build_array(jsonb_build_object('name', 'found via', 'url', p_found_via, 'role', 'discovery', 'checked_at', now())) else '[]'::jsonb end,
    jsonb_build_object('added_by', 'party_add_dice'), 'draft', now()
  from party_venues v where v.id = p_venue_id
  on conflict (id) do nothing;
  insert into party_fetches (request_id, event_id, url)
  values (net.http_get(url := 'https://dice.fm/event/' || key,
    headers := '{"User-Agent":"Mozilla/5.0 (compatible; NYHappy/1.0; +https://github.com/Droradi123123/NY-happy-)"}'::jsonb,
    timeout_milliseconds := 30000), eid, 'https://dice.fm/event/' || key);
  return eid;
end $$;

-- ---------- write API (the skill writes only through these) ----------

create or replace function public.party_lead_set(p_id bigint, p_status text, p_event_id text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open','merged','promoted','rejected') then raise exception 'bad status %', p_status; end if;
  if p_status in ('merged','promoted') and not exists (select 1 from party_events where id = p_event_id) then raise exception 'unknown event %', p_event_id; end if;
  update party_leads set status = p_status, matched_event_id = coalesce(p_event_id, matched_event_id),
    notes = concat_ws(' | ', notes, to_char(now(), 'YYYY-MM-DD') || ': ' || p_note) where id = p_id;
  return p_status;
end $$;

/** Facts from another source. A value that disagrees with the current one (from another
 *  source) becomes a conflict instead of overwriting it. Returns the conflicts. */
create or replace function public.party_event_facts(p_id text, p_values jsonb, p_src text, p_url text, p_status text default 'source_listed')
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; cur jsonb; conf jsonb := '[]'::jsonb; e party_events;
begin
  select * into e from party_events where id = p_id;
  if not found then raise exception 'unknown event %', p_id; end if;
  for k, v in select * from jsonb_each(p_values) loop
    cur := e.facts -> k -> 'value';
    if cur is not null and cur <> 'null'::jsonb and cur <> v and (e.facts -> k ->> 'src') <> p_src then
      conf := conf || jsonb_build_array(jsonb_build_object('field', k, 'have', cur, 'have_src', e.facts -> k ->> 'src', 'other', v, 'other_src', p_src, 'url', p_url, 'at', now()));
    else
      e.facts := e.facts || jsonb_build_object(k, party_fact(v, p_url, p_status, p_src));
    end if;
  end loop;
  update party_events set facts = e.facts, conflicts = conflicts || conf,
    sources = case when sources @> jsonb_build_array(jsonb_build_object('url', p_url)) then sources
              else sources || jsonb_build_array(jsonb_build_object('name', p_src, 'url', p_url, 'role', 'facts', 'checked_at', now())) end,
    publish_status = case when jsonb_array_length(conf) > 0 and publish_status in ('ready','published') then 'review' else publish_status end,
    review_reason = case when jsonb_array_length(conf) > 0 then 'conflict: ' || (select string_agg(c->>'field', ', ') from jsonb_array_elements(conf) c) else review_reason end,
    updated_at = now()
  where id = p_id;
  return conf;
end $$;

/** Page copy (original English, never source text). Required: about, expect, music,
 *  before_you_go, faq (3+). No em dashes. The event goes to review. */
create or replace function public.party_event_copy(p_id text, p_copy jsonb, p_author text default 'nyhappy-parties-skill')
returns text language plpgsql security definer set search_path = public as $$
declare k text; missing text[] := '{}';
begin
  foreach k in array array['about','expect','music','before_you_go','faq'] loop
    if coalesce(p_copy ->> k, '') in ('', '[]') then missing := missing || k; end if;
  end loop;
  if cardinality(missing) > 0 then raise exception 'copy is missing: %', array_to_string(missing, ', '); end if;
  if jsonb_array_length(p_copy -> 'faq') < 3 then raise exception 'faq needs at least 3 questions'; end if;
  if p_copy::text ~ '—' then raise exception 'house style: no em dashes'; end if;
  update party_events set copy = p_copy || jsonb_build_object('written_at', now(), 'author', p_author),
    publish_status = case when publish_status in ('draft','ready','published') then 'review' else publish_status end,
    review_reason = 'copy written: check before publishing', updated_at = now()
  where id = p_id;
  if not found then raise exception 'unknown event %', p_id; end if;
  return 'review';
end $$;

/** What still blocks an event from the site (empty array = can publish). */
create or replace function public.party_publish_blockers(p_id text) returns text[] language sql stable set search_path = public as $$
  select array_remove(array[
    case when e.event_status in ('cancelled','postponed','rescheduled') then 'status: ' || e.event_status end,
    case when coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then 'ended' end,
    case when e.starts_at is null then 'no start time' end,
    case when e.copy = '{}'::jsonb then 'no copy' end,
    case when jsonb_array_length(e.conflicts) > 0 then 'open conflicts' end,
    case when v.status <> 'active' or v.kind = 'placeholder' then 'venue not confirmed' end,
    case when e.age_min is null then 'age unknown' end,
    case when e.raw ? 'dice_read_at' and (e.raw->>'dice_read_at')::timestamptz < now() - interval '7 days' then 'DICE data older than 7 days' end
  ], null)
  from party_events e left join party_venues v on v.id = e.venue_id where e.id = p_id
$$;

/** ready/published only when nothing blocks; review/rejected need a reason. */
create or replace function public.party_event_status(p_id text, p_status text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare b text[];
begin
  if p_status in ('ready','published') then
    b := party_publish_blockers(p_id);
    if cardinality(b) > 0 then raise exception 'cannot % %: %', p_status, p_id, array_to_string(b, '; '); end if;
  elsif p_status in ('review','rejected') and coalesce(p_reason, '') = '' then
    raise exception 'a reason is required';
  elsif p_status not in ('draft') then raise exception 'bad status %', p_status;
  end if;
  update party_events set publish_status = p_status, review_reason = case when p_status in ('ready','published') then null else p_reason end, updated_at = now()
  where id = p_id;
  return p_status;
end $$;

/** Venue details from any source: {"neighborhood":..,"kind":..,"status":..,"facts":{..},"copy":{..}} */
create or replace function public.party_venue_set(p_id text, p_patch jsonb, p_src text, p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; f jsonb := '{}'::jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(p_patch -> 'facts', '{}'::jsonb)) loop
    f := f || jsonb_build_object(k, party_fact(v, p_url, 'source_listed', p_src));
  end loop;
  update party_venues set
    neighborhood = coalesce(p_patch ->> 'neighborhood', neighborhood),
    kind = coalesce(p_patch ->> 'kind', kind),
    status = coalesce(p_patch ->> 'status', status),
    facts = facts || f || case when p_patch ? 'neighborhood' then jsonb_build_object('neighborhood', party_fact(p_patch -> 'neighborhood', p_url, 'source_listed', p_src)) else '{}'::jsonb end,
    copy = case when p_patch ? 'copy' then p_patch -> 'copy' || jsonb_build_object('written_at', now()) else copy end,
    sources = sources || jsonb_build_array(jsonb_build_object('name', p_src, 'url', p_url, 'checked_at', now())),
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'unknown venue %', p_id; end if;
  return p_id;
end $$;

/** Neighborhood for venues without one: the one most happy-hour bars within 600 m carry. */
create or replace function public.party_venue_hoods() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with near as (
    select v.id, h.geo, count(*) c,
      min(6371000 * 2 * asin(sqrt(power(sin(radians(h.lat - v.lat) / 2), 2) + cos(radians(v.lat)) * cos(radians(h.lat)) * power(sin(radians(h.lng - v.lng) / 2), 2)))) d
    from party_venues v
    join h_nyc_happy_hour h on h.lat between v.lat - 0.006 and v.lat + 0.006 and h.lng between v.lng - 0.008 and v.lng + 0.008 and h.geo is not null
    where v.neighborhood is null and v.lat is not null and coalesce(v.kind, '') <> 'placeholder'
      and 6371000 * 2 * asin(sqrt(power(sin(radians(h.lat - v.lat) / 2), 2) + cos(radians(v.lat)) * cos(radians(h.lat)) * power(sin(radians(h.lng - v.lng) / 2), 2))) < 600
    group by v.id, h.geo
  ), pick as (select distinct on (id) id, geo, c, d from near order by id, c desc, d)
  update party_venues v set neighborhood = p.geo,
    facts = v.facts || jsonb_build_object('neighborhood', party_fact(to_jsonb(p.geo), null, 'derived', 'nearby happy-hour bars (' || p.c || ' within 600 m)')),
    updated_at = now()
  from pick p where p.id = v.id;
  get diagnostics n = row_count;
  update party_events e set neighborhood = v.neighborhood from party_venues v where v.id = e.venue_id and e.neighborhood is distinct from v.neighborhood;
  return n;
end $$;

-- ---------- Google Places (key in Vault as 'google_maps_api_key'; -1 when absent) ----------
-- Kept: the place ID (Google allows storing it); other Places content is used to VERIFY
-- (open or closed, address, website, phone, hours) and re-read every 30 days. Google
-- ratings, reviews and photos are not stored and never shown.

create or replace function public.party_google_request(n int default 20) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0; key text;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'google_maps_api_key' limit 1;
  if key is null then return -1; end if;
  for r in
    select v.* from party_venues v
    where coalesce(v.kind, '') <> 'placeholder' and v.lat is not null
      and coalesce(v.google_checked_at, 'epoch'::timestamptz) < now() - interval '30 days'
      and not exists (select 1 from party_fetches f where f.venue_id = v.id and f.done_at is null)
    order by v.google_checked_at nulls first, v.id limit least(n, 40)
  loop
    insert into party_fetches (request_id, venue_id, url, kind)
    values (net.http_post(
      url := 'https://places.googleapis.com/v1/places:searchText',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Goog-Api-Key', key,
        'X-Goog-FieldMask', 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.websiteUri,places.nationalPhoneNumber,places.regularOpeningHours.weekdayDescriptions,places.googleMapsUri,places.accessibilityOptions,places.primaryTypeDisplayName'),
      body := jsonb_build_object('textQuery', r.name || ', ' || coalesce(r.address, 'New York'), 'maxResultCount', 3,
        'locationBias', jsonb_build_object('circle', jsonb_build_object('center', jsonb_build_object('latitude', r.lat, 'longitude', r.lng), 'radius', 400))),
      timeout_milliseconds := 20000), r.id, 'https://places.googleapis.com/v1/places:searchText', 'google');
    k := k + 1;
  end loop;
  return k;
end $$;

create or replace function public.party_google_ingest() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare f record; resp record; v party_venues; p jsonb; d float8; ok int := 0; nomatch int := 0; closed int := 0; err int := 0; src text := 'google-places';
begin
  for f in select * from party_fetches where done_at is null and kind = 'google' loop
    select * into resp from net._http_response where id = f.request_id;
    if not found then continue; end if;
    select * into v from party_venues where id = f.venue_id;
    if resp.status_code <> 200 then
      update party_fetches set done_at = now(), result = 'http ' || resp.status_code || ': ' || left(resp.content, 120) where request_id = f.request_id;
      err := err + 1; continue;
    end if;
    -- the nearest result within 250 m of the venue's own coordinates, else no match
    select x, 6371000 * 2 * asin(sqrt(power(sin(radians((x->'location'->>'latitude')::float8 - v.lat) / 2), 2)
        + cos(radians(v.lat)) * cos(radians((x->'location'->>'latitude')::float8)) * power(sin(radians((x->'location'->>'longitude')::float8 - v.lng) / 2), 2)))
      into p, d
    from jsonb_array_elements(coalesce(resp.content::jsonb -> 'places', '[]'::jsonb)) x
    order by 2 limit 1;
    if p is null or d > 250 then
      update party_venues set google_checked_at = now(),
        facts = facts || jsonb_build_object('google_match', party_fact(to_jsonb('none within 250 m'::text), null, 'missing', src))
      where id = v.id;
      update party_fetches set done_at = now(), result = 'no match' where request_id = f.request_id;
      nomatch := nomatch + 1; continue;
    end if;
    update party_venues set
      google_checked_at = now(),
      status = case when p->>'businessStatus' = 'CLOSED_PERMANENTLY' then 'closed' else status end,
      facts = facts || jsonb_build_object(
        'google_place_id', party_fact(p->'id', p->>'googleMapsUri', 'source_listed', src),
        'google_name', party_fact(p->'displayName'->'text', p->>'googleMapsUri', 'source_listed', src),
        'google_address', party_fact(p->'formattedAddress', p->>'googleMapsUri', 'source_listed', src),
        'business_status', party_fact(p->'businessStatus', p->>'googleMapsUri', 'source_listed', src),
        'website', party_fact(p->'websiteUri', p->>'googleMapsUri', 'source_listed', src),
        'phone', party_fact(p->'nationalPhoneNumber', p->>'googleMapsUri', 'source_listed', src),
        'hours', party_fact(p->'regularOpeningHours'->'weekdayDescriptions', p->>'googleMapsUri', 'source_listed', src),
        'accessibility', party_fact(p->'accessibilityOptions', p->>'googleMapsUri', 'source_listed', src),
        'google_type', party_fact(p->'primaryTypeDisplayName'->'text', p->>'googleMapsUri', 'source_listed', src),
        'google_match', party_fact(to_jsonb(round(d::numeric) || ' m from DICE coordinates'), null, 'derived', src)),
      updated_at = now()
    where id = v.id;
    if p->>'businessStatus' = 'CLOSED_PERMANENTLY' then
      update party_events set publish_status = case when publish_status in ('ready','published') then 'review' else publish_status end,
        review_reason = 'Google lists the venue as permanently closed' where venue_id = v.id and publish_status <> 'ended';
      closed := closed + 1;
    end if;
    update party_fetches set done_at = now(), result = 'ok' where request_id = f.request_id;
    ok := ok + 1;
  end loop;
  return jsonb_build_object('matched', ok, 'no_match', nomatch, 'closed', closed, 'errors', err,
    'waiting', (select count(*) from party_fetches where done_at is null and kind = 'google'));
end $$;

-- none of the pipeline or write functions is callable from the site
revoke all on function public.party_dice_request(int, interval) from public, anon, authenticated;
revoke all on function public.party_dice_ingest() from public, anon, authenticated;
revoke all on function public.party_add_dice(text, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.party_lead_set(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.party_event_facts(text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.party_event_copy(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.party_event_status(text, text, text) from public, anon, authenticated;
revoke all on function public.party_venue_set(text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.party_venue_hoods() from public, anon, authenticated;
revoke all on function public.party_google_request(int) from public, anon, authenticated;
revoke all on function public.party_google_ingest() from public, anon, authenticated;
