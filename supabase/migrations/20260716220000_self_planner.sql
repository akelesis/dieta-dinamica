alter table public.plan_preferences
  add column if not exists plan_mode text not null default 'guided';

alter table public.plan_preferences
  drop constraint if exists plan_preferences_plan_mode_check;

alter table public.plan_preferences
  add constraint plan_preferences_plan_mode_check
  check (plan_mode in ('self', 'guided'));

create table if not exists public.self_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_json jsonb not null default '{"meals": [], "updatedAt": ""}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists self_plans_updated_at on public.self_plans;
create trigger self_plans_updated_at
  before update on public.self_plans
  for each row execute function public.set_updated_at();

alter table public.self_plans enable row level security;

drop policy if exists "users_manage_own_self_plan" on public.self_plans;
create policy "users_manage_own_self_plan" on public.self_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.self_plans to authenticated;
revoke all on public.self_plans from anon;
