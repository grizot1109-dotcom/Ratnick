-- Обновление рейтинга: очки с комбо (до 30 за ответ), число ачивок, дуэли.
-- Выполнить после supabase.sql: Supabase → SQL Editor → New query → вставить → Run.

alter table public.scores add column if not exists badges int not null default 0;
alter table public.scores drop constraint if exists scores_points_check;
alter table public.scores add constraint scores_points_check check (points between 0 and 60000);
alter table public.scores drop constraint if exists scores_badges_check;
alter table public.scores add constraint scores_badges_check check (badges between 0 and 1000);

-- Дуэли: один вызов — один набор формул, у каждого игрока одна попытка.
create table if not exists public.duels (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  creator_id uuid not null references public.players(id) on delete cascade,
  creator_name text not null,
  formulas text[] not null check (array_length(formulas, 1) between 3 and 20),
  created_at timestamptz not null default now()
);
create table if not exists public.duel_results (
  code text not null references public.duels(code) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null,
  correct int not null check (correct >= 0),
  points int not null check (points >= 0),
  time_ms int not null check (time_ms >= 0),
  created_at timestamptz not null default now(),
  primary key (code, player_id)
);
alter table public.duels enable row level security;
alter table public.duel_results enable row level security;
drop policy if exists "duels are public" on public.duels;
create policy "duels are public" on public.duels for select using (true);
drop policy if exists "duel results are public" on public.duel_results;
create policy "duel results are public" on public.duel_results for select using (true);
revoke insert, update, delete on public.duels, public.duel_results from anon, authenticated;
grant select on public.duels, public.duel_results to anon, authenticated;

-- Проверка игрока по секрету (новый игрок создаётся); вызывается только из функций ниже.
create or replace function public._auth_player(p_id uuid, p_secret text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  p_name := btrim(p_name);
  if char_length(p_name) not between 2 and 20 then raise exception 'bad name'; end if;
  if char_length(p_secret) < 16 then raise exception 'bad secret'; end if;
  select secret into s from players where id = p_id;
  if s is null then
    insert into players (id, name, secret) values (p_id, p_name, p_secret);
  elsif s <> p_secret then
    raise exception 'wrong secret';
  else
    update players set name = p_name where id = p_id and name <> p_name;
    update scores set name = p_name where player_id = p_id and name <> p_name;
    update duel_results set name = p_name where player_id = p_id and name <> p_name;
  end if;
end $$;
revoke all on function public._auth_player(uuid, text, text) from public, anon, authenticated;

drop function if exists public.submit_score(uuid, text, text, date, int, int, int, int);
create or replace function public.submit_score(
  p_id uuid, p_secret text, p_name text, p_day date,
  p_points int, p_correct int, p_attempts int, p_streak int, p_badges int default 0
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _auth_player(p_id, p_secret, p_name);
  if p_day < current_date - 2 or p_day > current_date + 1 then raise exception 'bad day'; end if;
  if p_attempts < 0 or p_correct < 0 or p_points < 0 or p_streak < 0 or p_badges < 0 or p_badges > 1000
     or p_correct > p_attempts or p_attempts > 2000 or p_points > p_attempts * 30 then raise exception 'bad score'; end if;
  insert into scores (player_id, day, name, points, correct, attempts, streak, badges, updated_at)
  values (p_id, p_day, btrim(p_name), p_points, p_correct, p_attempts, p_streak, p_badges, now())
  on conflict (player_id, day) do update
    set name = excluded.name, points = excluded.points, correct = excluded.correct,
        attempts = excluded.attempts, streak = excluded.streak, badges = excluded.badges, updated_at = now();
end $$;
revoke all on function public.submit_score(uuid, text, text, date, int, int, int, int, int) from public;
grant execute on function public.submit_score(uuid, text, text, date, int, int, int, int, int) to anon, authenticated;

create or replace function public.create_duel(p_id uuid, p_secret text, p_name text, p_formulas text[])
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  perform _auth_player(p_id, p_secret, p_name);
  if array_length(p_formulas, 1) is null or array_length(p_formulas, 1) not between 3 and 20 then raise exception 'bad formulas'; end if;
  if (select count(*) from duels where creator_id = p_id and created_at > now() - interval '1 hour') >= 20 then raise exception 'too many duels'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from duels where code = c);
  end loop;
  insert into duels (code, creator_id, creator_name, formulas) values (c, p_id, btrim(p_name), p_formulas);
  return c;
end $$;
revoke all on function public.create_duel(uuid, text, text, text[]) from public;
grant execute on function public.create_duel(uuid, text, text, text[]) to anon, authenticated;

create or replace function public.submit_duel(p_code text, p_id uuid, p_secret text, p_name text, p_correct int, p_points int, p_time_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _auth_player(p_id, p_secret, p_name);
  select array_length(formulas, 1) into n from duels where code = p_code;
  if n is null then raise exception 'no duel'; end if;
  if p_correct < 0 or p_correct > n or p_points < 0 or p_points > n * 30 or p_time_ms < n * 1000 then raise exception 'bad result'; end if;
  insert into duel_results (code, player_id, name, correct, points, time_ms)
  values (p_code, p_id, btrim(p_name), p_correct, p_points, p_time_ms)
  on conflict (code, player_id) do nothing;
end $$;
revoke all on function public.submit_duel(text, uuid, text, text, int, int, int) from public;
grant execute on function public.submit_duel(text, uuid, text, text, int, int, int) to anon, authenticated;
