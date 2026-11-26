-- Резервная копия прогресса Формулографа (вход по паролю — общий с «Орфографом»: ru_set_password / ru_login).
-- Уже применено к проекту. Supabase → SQL Editor → вставить → Run, если нужно повторить.
create table if not exists public.fg_backups (
  player_id uuid primary key references public.players(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fg_backups enable row level security;
revoke all on public.fg_backups from anon, authenticated;

create or replace function public.fg_save_backup(p_id uuid, p_secret text, p_name text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _auth_player(p_id, p_secret, p_name);
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 700000 then raise exception 'bad backup'; end if;
  insert into fg_backups (player_id, data) values (p_id, p_data)
  on conflict (player_id) do update set data = excluded.data, updated_at = now();
end $$;
revoke all on function public.fg_save_backup(uuid, text, text, jsonb) from public;
grant execute on function public.fg_save_backup(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.fg_load_backup(p_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s text; d jsonb;
begin
  select secret into s from players where id = p_id;
  if s is null or s <> p_secret then raise exception 'wrong secret'; end if;
  select data into d from fg_backups where player_id = p_id;
  return d;
end $$;
revoke all on function public.fg_load_backup(uuid, text) from public;
grant execute on function public.fg_load_backup(uuid, text) to anon, authenticated;
