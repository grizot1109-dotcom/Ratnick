-- Профили игроков: короткая сводка статистики (JSON до 8 КБ), которую приложение отправляет само.
-- Выполнить после supabase_v3.sql: Supabase → SQL Editor → New query → вставить → Run.

create table if not exists public.profiles (
  player_id uuid primary key references public.players(id) on delete cascade,
  stats jsonb not null,
  updated_at timestamptz not null default now(),
  constraint profiles_stats_size check (octet_length(stats::text) <= 8192)
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;

create or replace function public.set_profile(p_id uuid, p_secret text, p_name text, p_stats jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _auth_player(p_id, p_secret, p_name);
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' or octet_length(p_stats::text) > 8192 then raise exception 'bad stats'; end if;
  insert into profiles (player_id, stats) values (p_id, p_stats)
  on conflict (player_id) do update set stats = excluded.stats, updated_at = now();
end $$;
revoke all on function public.set_profile(uuid, text, text, jsonb) from public;
grant execute on function public.set_profile(uuid, text, text, jsonb) to anon, authenticated;
