-- VivaMeta: schema inicial para autenticação, dados do usuário e cache nutricional.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  age smallint not null check (age between 14 and 100),
  height numeric(5,2) not null check (height between 100 and 250),
  weight numeric(6,2) not null check (weight between 30 and 400),
  sex text not null check (sex in ('female', 'male')),
  goal text not null check (goal in ('lose', 'maintain', 'gain')),
  workouts_per_week smallint not null check (workouts_per_week between 0 and 7),
  workout_minutes smallint not null check (workout_minutes between 0 and 360),
  intensity text not null check (intensity in ('light', 'moderate', 'intense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dietary_style text not null check (dietary_style in ('omnivore', 'vegetarian', 'vegan', 'pescatarian')),
  meals_per_day smallint not null check (meals_per_day between 3 and 6),
  restrictions text[] not null default '{}',
  favorite_foods text not null default '',
  disliked_foods text not null default '',
  cooking_time text not null check (cooking_time in ('quick', 'moderate', 'flexible')),
  budget text not null check (budget in ('economy', 'balanced', 'flexible')),
  breakfast_time time not null,
  lunch_time time not null,
  dinner_time time not null,
  has_health_condition boolean not null default false,
  health_notes text not null default '',
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.day_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  workout_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  day_log_id uuid not null references public.day_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_time time not null,
  description text not null check (char_length(description) between 1 and 1000),
  calories integer not null check (calories >= 0),
  meal_type text not null,
  breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index day_logs_user_date_idx on public.day_logs(user_id, log_date desc);
create index meal_entries_day_time_idx on public.meal_entries(day_log_id, meal_time);

-- Cache compartilhado: somente Edge Functions/service role têm acesso.
create table public.food_estimate_cache (
  cache_key text primary key,
  canonical_text text not null,
  original_description text not null,
  response_json jsonb not null,
  source_model text not null,
  schema_version integer not null default 1,
  hit_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.food_item_cache (
  item_key text primary key,
  normalized_name text not null,
  display_name text not null,
  unit text not null,
  base_amount numeric not null check (base_amount > 0),
  base_calories numeric not null check (base_calories >= 0),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  source_model text not null,
  hit_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.food_cache_metrics (
  name text primary key,
  value bigint not null default 0
);
insert into public.food_cache_metrics(name, value) values ('saved_requests', 0);

create or replace function public.record_food_cache_hit(p_cache_key text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_hits bigint;
begin
  update public.food_estimate_cache
    set hit_count = hit_count + 1, last_used_at = now()
    where cache_key = p_cache_key returning hit_count into new_hits;
  update public.food_cache_metrics set value = value + 1 where name = 'saved_requests';
  return coalesce(new_hits, 0);
end;
$$;

create or replace function public.record_food_item_hits(p_item_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.food_item_cache
    set hit_count = hit_count + 1, last_used_at = now()
    where item_key = any(p_item_keys);
  update public.food_cache_metrics set value = value + 1 where name = 'saved_requests';
end;
$$;

-- Sincroniza treino e refeições do dia em uma única transação.
create or replace function public.replace_day_log(
  p_log_date date,
  p_workout_done boolean,
  p_entries jsonb default '[]'::jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_day_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.day_logs (user_id, log_date, workout_done)
  values (v_user_id, p_log_date, p_workout_done)
  on conflict (user_id, log_date) do update
    set workout_done = excluded.workout_done
  returning id into v_day_log_id;

  delete from public.meal_entries where day_log_id = v_day_log_id;

  insert into public.meal_entries (id, day_log_id, user_id, meal_time, description, calories, meal_type, breakdown)
  select
    (entry->>'id')::uuid,
    v_day_log_id,
    v_user_id,
    (entry->>'time')::time,
    entry->>'description',
    (entry->>'calories')::integer,
    entry->>'mealType',
    coalesce(entry->'breakdown', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) entry;

  return v_day_log_id;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger plan_preferences_updated_at before update on public.plan_preferences for each row execute function public.set_updated_at();
create trigger day_logs_updated_at before update on public.day_logs for each row execute function public.set_updated_at();
create trigger food_estimate_cache_updated_at before update on public.food_estimate_cache for each row execute function public.set_updated_at();
create trigger food_item_cache_updated_at before update on public.food_item_cache for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.plan_preferences enable row level security;
alter table public.day_logs enable row level security;
alter table public.meal_entries enable row level security;
alter table public.food_estimate_cache enable row level security;
alter table public.food_item_cache enable row level security;
alter table public.food_cache_metrics enable row level security;

create policy "users_manage_own_profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_plan" on public.plan_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_days" on public.day_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_read_own_meals" on public.meal_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users_insert_own_meals" on public.meal_entries for insert to authenticated
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.day_logs d where d.id = day_log_id and d.user_id = (select auth.uid())
    )
  );
create policy "users_update_own_meals" on public.meal_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.day_logs d where d.id = day_log_id and d.user_id = (select auth.uid())
    )
  );
create policy "users_delete_own_meals" on public.meal_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.plan_preferences, public.day_logs, public.meal_entries to authenticated;
revoke all on public.food_estimate_cache, public.food_item_cache, public.food_cache_metrics from anon, authenticated;
grant all on public.food_estimate_cache, public.food_item_cache, public.food_cache_metrics to service_role;
revoke execute on function public.record_food_cache_hit(text), public.record_food_item_hits(text[]) from public, anon, authenticated;
grant execute on function public.record_food_cache_hit(text), public.record_food_item_hits(text[]) to service_role;
revoke execute on function public.replace_day_log(date, boolean, jsonb) from public, anon;
grant execute on function public.replace_day_log(date, boolean, jsonb) to authenticated;
