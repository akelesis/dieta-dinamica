-- Planos alimentares gerados pela IA e reutilizados enquanto o perfil não mudar.
create table public.generated_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  input_hash text not null,
  plan_json jsonb not null,
  source_model text not null,
  prompt_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger generated_plans_updated_at
  before update on public.generated_plans
  for each row execute function public.set_updated_at();

alter table public.generated_plans enable row level security;

create policy "users_read_own_generated_plan" on public.generated_plans
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users_delete_own_generated_plan" on public.generated_plans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, delete on public.generated_plans to authenticated;
revoke all on public.generated_plans from anon;
grant all on public.generated_plans to service_role;
