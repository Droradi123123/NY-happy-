-- DICE keeps the "rescheduled" status on a listing after it moves to a new date, so a moved night could never be
-- published again, even once its date and copy were re-checked. party_reschedule_ok records that someone checked the
-- night's CURRENT date (and that the page copy matches it) against a source; the blocker then lets it through for
-- that date only. If DICE moves it again, night_date no longer matches the check and the night is blocked again.
-- (Applied 2026-11-04 through the Supabase connection.)
create or replace function public.party_reschedule_ok(p_id text, p_src text, p_url text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare e party_events;
begin
  select * into e from party_events where id = p_id;
  if not found then raise exception 'unknown event %', p_id; end if;
  if e.event_status <> 'rescheduled' then raise exception '% is not marked rescheduled (status %)', p_id, e.event_status; end if;
  if coalesce(p_note, '') = '' or coalesce(p_url, '') !~ '^https://' then raise exception 'a note and the source URL are required'; end if;
  update party_events set facts = facts || jsonb_build_object('reschedule_checked',
      party_fact(to_jsonb(e.night_date::text), p_url, 'verified', p_src, now()) || jsonb_build_object('note', p_note)),
    updated_at = now()
  where id = p_id;
  return e.night_date::text;
end $$;
revoke execute on function public.party_reschedule_ok(text, text, text, text) from public, anon, authenticated;

create or replace function public.party_publish_blockers(p_id text)
 returns text[] language sql stable set search_path to 'public' as $function$
  select array_remove(array[
    case when e.event_status in ('cancelled','postponed') then 'status: ' || e.event_status end,
    case when e.event_status = 'rescheduled' and coalesce(e.facts->'reschedule_checked'->>'value', '') <> e.night_date::text then 'status: rescheduled (new date not checked)' end,
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
