-- Рейтинг «Формулографа». Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.

create table if not exists public.players (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 20),
  secret text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  player_id uuid not null references public.players(id) on delete cascade,
  day date not null,
  name text not null,
  points int not null default 0 check (points between 0 and 20000),
  correct int not null default 0 check (correct >= 0),
  attempts int not null default 0 check (attempts between 0 and 2000),
  streak int not null default 0 check (streak >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, day)
);
create index if not exists scores_day_idx on public.scores (day);

-- Рейтинг читают все; писать можно только через функцию submit_score.
alter table public.players enable row level security;
alter table public.scores enable row level security;
drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores for select using (true);
revoke all on public.players from anon, authenticated;
revoke insert, update, delete on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;

-- Сохраняет итог игрока за день. Секрет хранится на телефоне игрока:
-- без него чужие очки не перезаписать.
create or replace function public.submit_score(
  p_id uuid, p_secret text, p_name text, p_day date,
  p_points int, p_correct int, p_attempts int, p_streak int
) returns void
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  p_name := btrim(p_name);
  if char_length(p_name) not between 2 and 20 then raise exception 'bad name'; end if;
  if char_length(p_secret) < 16 then raise exception 'bad secret'; end if;
  if p_day < current_date - 2 or p_day > current_date + 1 then raise exception 'bad day'; end if;
  if p_attempts < 0 or p_correct < 0 or p_points < 0 or p_streak < 0
     or p_correct > p_attempts or p_points > p_attempts * 10 then raise exception 'bad score'; end if;

  select secret into s from players where id = p_id;
  if s is null then
    insert into players (id, name, secret) values (p_id, p_name, p_secret);
  elsif s <> p_secret then
    raise exception 'wrong secret';
  else
    update players set name = p_name where id = p_id and name <> p_name;
    update scores set name = p_name where player_id = p_id and name <> p_name;
  end if;

  insert into scores (player_id, day, name, points, correct, attempts, streak, updated_at)
  values (p_id, p_day, p_name, p_points, p_correct, p_attempts, p_streak, now())
  on conflict (player_id, day) do update
    set name = excluded.name, points = excluded.points, correct = excluded.correct,
        attempts = excluded.attempts, streak = excluded.streak, updated_at = now();
end $$;

revoke all on function public.submit_score(uuid, text, text, date, int, int, int, int) from public;
grant execute on function public.submit_score(uuid, text, text, date, int, int, int, int) to anon, authenticated;
