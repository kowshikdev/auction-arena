-- Retained players belong to their franchises and are never auctioned. Every room uses
-- the season's retentions, and retained players of franchises nobody picked stay out of
-- the pool too. Rooms that already finished keep their old settings (NOT VALID).

update public.room_settings s
set retention_mode = 'season', inactive_retained_in_pool = false
from public.rooms r
where r.id = s.room_id and r.status = 'lobby';

alter table public.room_settings alter column retention_mode set default 'season';
alter table public.room_settings alter column inactive_retained_in_pool set default false;

alter table public.room_settings
  add constraint room_settings_retained_not_auctioned
  check (retention_mode = 'season' and not inactive_retained_in_pool) not valid;

update public.seasons
set default_rules = (default_rules - 'inactive_retained_in_pool') || '{"retention_mode": "season"}'::jsonb;
