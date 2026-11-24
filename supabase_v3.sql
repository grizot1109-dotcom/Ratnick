-- Аватарки: эмодзи и цвет кружка, хранятся строкой вида "🦊:3".
-- Выполнить после supabase_v2.sql: Supabase → SQL Editor → New query → вставить → Run.

alter table public.scores add column if not exists avatar text not null default '';
alter table public.scores drop constraint if exists scores_avatar_check;
alter table public.scores add constraint scores_avatar_check check (char_length(avatar) <= 32);
alter table public.duel_results add column if not exists avatar text not null default '';
alter table public.duel_results drop constraint if exists duel_results_avatar_check;
alter table public.duel_results add constraint duel_results_avatar_check check (char_length(avatar) <= 32);

drop function if exists public.submit_score(uuid, text, text, date, int, int, int, int, int);
create or replace function public.submit_score(
  p_id uuid, p_secret text, p_name text, p_day date,
  p_points int, p_correct int, p_attempts int, p_streak int, p_badges int default 0, p_avatar text default ''
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _auth_player(p_id, p_secret, p_name);
  if p_day < current_date - 2 or p_day > current_date + 1 then raise exception 'bad day'; end if;
  if p_attempts < 0 or p_correct < 0 or p_points < 0 or p_streak < 0 or p_badges < 0 or p_badges > 1000
     or p_correct > p_attempts or p_attempts > 2000 or p_points > p_attempts * 30 then raise exception 'bad score'; end if;
  p_avatar := left(coalesce(p_avatar, ''), 32);
  insert into scores (player_id, day, name, points, correct, attempts, streak, badges, avatar, updated_at)
  values (p_id, p_day, btrim(p_name), p_points, p_correct, p_attempts, p_streak, p_badges, p_avatar, now())
  on conflict (player_id, day) do update
    set name = excluded.name, points = excluded.points, correct = excluded.correct, attempts = excluded.attempts,
        streak = excluded.streak, badges = excluded.badges, avatar = excluded.avatar, updated_at = now();
  -- новая аватарка сразу видна и в прошлых днях недели, и в дуэлях
  update scores set avatar = p_avatar where player_id = p_id and avatar <> p_avatar;
  update duel_results set avatar = p_avatar where player_id = p_id and avatar <> p_avatar;
end $$;
revoke all on function public.submit_score(uuid, text, text, date, int, int, int, int, int, text) from public;
grant execute on function public.submit_score(uuid, text, text, date, int, int, int, int, int, text) to anon, authenticated;

drop function if exists public.submit_duel(text, uuid, text, text, int, int, int);
create or replace function public.submit_duel(p_code text, p_id uuid, p_secret text, p_name text, p_correct int, p_points int, p_time_ms int, p_avatar text default '')
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _auth_player(p_id, p_secret, p_name);
  select array_length(formulas, 1) into n from duels where code = p_code;
  if n is null then raise exception 'no duel'; end if;
  if p_correct < 0 or p_correct > n or p_points < 0 or p_points > n * 30 or p_time_ms < n * 1000 then raise exception 'bad result'; end if;
  insert into duel_results (code, player_id, name, correct, points, time_ms, avatar)
  values (p_code, p_id, btrim(p_name), p_correct, p_points, p_time_ms, left(coalesce(p_avatar, ''), 32))
  on conflict (code, player_id) do nothing;
end $$;
revoke all on function public.submit_duel(text, uuid, text, text, int, int, int, text) from public;
grant execute on function public.submit_duel(text, uuid, text, text, int, int, int, text) to anon, authenticated;

-- Фото-аватарки: маленькая JPEG-картинка (128×128), которую приложение сжимает само.
create table if not exists public.avatars (
  player_id uuid primary key references public.players(id) on delete cascade,
  img text not null check (char_length(img) <= 40000 and img like 'data:image/jpeg;base64,%'),
  updated_at timestamptz not null default now()
);
alter table public.avatars enable row level security;
drop policy if exists "avatars are public" on public.avatars;
create policy "avatars are public" on public.avatars for select using (true);
revoke insert, update, delete on public.avatars from anon, authenticated;
grant select on public.avatars to anon, authenticated;

create or replace function public.set_avatar(p_id uuid, p_secret text, p_name text, p_img text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _auth_player(p_id, p_secret, p_name);
  if p_img is null or p_img = '' then delete from avatars where player_id = p_id; return; end if;
  if char_length(p_img) > 40000 or p_img !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' then raise exception 'bad image'; end if;
  insert into avatars (player_id, img) values (p_id, p_img)
  on conflict (player_id) do update set img = excluded.img, updated_at = now();
end $$;
revoke all on function public.set_avatar(uuid, text, text, text) from public;
grant execute on function public.set_avatar(uuid, text, text, text) to anon, authenticated;
