-- Parties sold outside DICE (Resident Advisor, Eventbrite, Shotgun, a venue's own calendar).
-- party_add_listing(p) adds or refreshes one event from its public listing, read by a person or an
-- agent (RA and Posh block automated fetching, so nothing here fetches). Every field it stores is a
-- fact with the listing URL, the seller and the time it was read; the listing's own text is kept in
-- raw as source material and is never published. Calling it again with a fresh read updates the
-- facts and the read time. A listing read more than 7 days ago blocks publishing (party_publish_blockers),
-- because no automatic job re-reads these sellers the way party_dice_ingest re-reads DICE.
--
-- p: { vendor: 'RA'|'Eventbrite'|'Shotgun'|'Venue', url, title, starts_at, ends_at?, doors_at?,
--      venue_id, room?, age_min?, performers?: [], organizer?, themes?: [], event_status?,
--      description?, found_via? }

create or replace function public.party_add_listing(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  vendor text := p->>'vendor';
  url text := p->>'url';
  s timestamptz := (p->>'starts_at')::timestamptz;
  key text; eid text; nd date; base text; sl text; v party_venues; now_ timestamptz := now();
begin
  if vendor not in ('RA', 'Eventbrite', 'Shotgun', 'Venue') then raise exception 'vendor must be RA, Eventbrite, Shotgun or Venue'; end if;
  if url !~ '^https://' then raise exception 'url must be an https listing URL'; end if;
  if coalesce(trim(p->>'title'), '') = '' then raise exception 'title is required'; end if;
  if s is null then raise exception 'starts_at is required'; end if;
  select * into v from party_venues where id = p->>'venue_id';
  if not found then raise exception 'unknown venue %: add it to party_venues first', p->>'venue_id'; end if;
  if p ? 'age_min' and (p->>'age_min')::int not between 0 and 25 then raise exception 'age_min out of range'; end if;

  key := case vendor
    when 'RA' then (regexp_match(url, 'ra\.co/events/(\d+)'))[1]
    when 'Eventbrite' then (regexp_match(url, '-(\d{6,})(?:[/?#]|$)'))[1]
    when 'Shotgun' then (regexp_match(url, 'shotgun\.live/(?:[a-z]{2}/)?events/([a-z0-9-]+)'))[1]
    else left(md5(url), 16) end;
  if key is null then raise exception 'could not read the event id from %', url; end if;
  eid := lower(vendor) || ':' || key;
  nd := party_night(s);
  base := party_slugify(p->>'title') || '-' || nd;
  sl := base;
  if exists (select 1 from party_events where slug = sl and id <> eid) then sl := base || '-' || left(md5(eid), 4); end if;

  insert into party_events (id, slug, title, starts_at, ends_at, doors_at, night_date, event_status, venue_id, room, borough, neighborhood,
    age_min, themes, performers, organizer, ticket_url, ticket_vendor, facts, sources, raw, publish_status, first_seen, last_checked)
  values (eid, sl, p->>'title', s, (p->>'ends_at')::timestamptz, (p->>'doors_at')::timestamptz, nd, coalesce(p->>'event_status', 'scheduled'),
    v.id, p->>'room', v.borough, v.neighborhood, (p->>'age_min')::int,
    coalesce(array(select jsonb_array_elements_text(p->'themes')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p->'performers')), '{}'),
    p->>'organizer', url, case vendor when 'RA' then 'Resident Advisor' when 'Venue' then coalesce(v.name, 'the venue') else vendor end,
    jsonb_build_object(
      'title', party_fact(p->'title', url, 'source_listed', lower(vendor), now_),
      'start', party_fact(p->'starts_at', url, 'source_listed', lower(vendor), now_),
      'end', party_fact(p->'ends_at', url, 'source_listed', lower(vendor), now_),
      'doors', party_fact(p->'doors_at', url, 'source_listed', lower(vendor), now_),
      'age', party_fact(p->'age_min', url, 'source_listed', lower(vendor), now_),
      'performers', party_fact(p->'performers', url, 'source_listed', lower(vendor), now_)),
    jsonb_build_array(jsonb_build_object('name', case vendor when 'RA' then 'Resident Advisor' else vendor end, 'url', url, 'role', 'tickets', 'checked_at', now_))
      || case when p ? 'found_via' then jsonb_build_array(jsonb_build_object('name', 'found via', 'url', p->>'found_via', 'role', 'discovery', 'checked_at', now_)) else '[]'::jsonb end,
    jsonb_build_object('added_by', 'party_add_listing', 'listing_read_at', now_,
      'note', 'source text: never publication copy, never published', 'description', p->>'description'),
    'draft', now_, now_)
  on conflict (id) do update set
    title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at, doors_at = excluded.doors_at,
    night_date = excluded.night_date, event_status = excluded.event_status, room = excluded.room, age_min = excluded.age_min,
    performers = excluded.performers, organizer = excluded.organizer, facts = party_events.facts || excluded.facts,
    sources = excluded.sources, raw = party_events.raw || excluded.raw, last_checked = now_, updated_at = now_;
  return eid;
end $$;

revoke execute on function public.party_add_listing(jsonb) from public, anon, authenticated;

-- the same publishing gate, plus: a listing nobody re-read for 7 days does not go (or stay) live
create or replace function public.party_publish_blockers(p_id text) returns text[]
language sql stable set search_path to 'public' as $function$
  select array_remove(array[
    case when e.event_status in ('cancelled','postponed','rescheduled') then 'status: ' || e.event_status end,
    case when coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then 'ended' end,
    case when e.starts_at is null then 'no start time' end,
    case when e.copy = '{}'::jsonb then 'no copy' end,
    case when jsonb_array_length(e.conflicts) > 0 then 'open conflicts' end,
    case when v.status <> 'active' or v.kind = 'placeholder' then 'venue not confirmed' end,
    case when e.age_min is null then 'age unknown' end,
    case when e.raw ? 'dice_read_at' and (e.raw->>'dice_read_at')::timestamptz < now() - interval '7 days' then 'DICE data older than 7 days' end,
    case when e.raw ? 'listing_read_at' and (e.raw->>'listing_read_at')::timestamptz < now() - interval '7 days' then 'listing data older than 7 days' end
  ], null)
  from party_events e left join party_venues v on v.id = e.venue_id where e.id = p_id
$function$;
