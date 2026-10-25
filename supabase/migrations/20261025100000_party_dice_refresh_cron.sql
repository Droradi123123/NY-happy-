-- Applied 2026-10-25: every upcoming DICE party is re-read about once a day (price, sold out, cancelled,
-- rescheduled), 15 events every 15 minutes, gentle on DICE. Undo: select cron.unschedule('party-dice-refresh');
select cron.schedule('party-dice-refresh', '*/15 * * * *', $$select public.party_dice_ingest(); select public.party_dice_request(15, '20 hours');$$);
