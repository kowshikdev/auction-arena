-- Rahane is out of the auction; the auction opens with the headline names as marquee sets.
do $$
declare
  v_season text := (select id from public.seasons where is_active);
begin
  update public.player_seasons ps set is_available = false
  from public.players p
  where p.id = ps.player_id and ps.season_id = v_season and p.full_name = 'Ajinkya Rahane';

  update public.player_seasons ps set is_marquee = false where ps.season_id = v_season;

  -- Named headliners first.
  update public.player_seasons ps set is_marquee = true
  from public.players p
  where p.id = ps.player_id and ps.season_id = v_season and ps.is_available and not ps.is_retained
    and p.full_name in ('Shimron Hetmyer', 'Trent Boult', 'Deepak Chahar', 'Matheesha Pathirana', 'Mustafizur Rahman',
                        'Rachin Ravindra', 'AM Ghazanfar', 'Lockie Ferguson', 'Avesh Khan');

  -- Fill two marquee sets of eight with the best remaining big-base names.
  update public.player_seasons ps set is_marquee = true
  where ps.season_id = v_season and ps.player_id in (
    select ps2.player_id
    from public.player_seasons ps2
    join public.players p on p.id = ps2.player_id and p.is_active
    left join public.player_ratings r on r.player_id = p.id
    where ps2.season_id = v_season and ps2.is_available and not ps2.is_retained and not ps2.is_marquee
      and ps2.base_price_lakh >= 200
    order by coalesce(r.overall, 0) desc, p.full_name
    limit 7
  );

  perform public._rebuild_sets(v_season);
end $$;
