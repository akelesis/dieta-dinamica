create table if not exists public.billing_configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.billing_configuration (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.billing_configuration enable row level security;
revoke all on public.billing_configuration from anon, authenticated;
grant all on public.billing_configuration to service_role;

create or replace function public.is_billing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.billing_configuration where singleton), false);
$$;

revoke execute on function public.is_billing_enabled() from public;
grant execute on function public.is_billing_enabled() to anon, authenticated, service_role;

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_mode text not null check (plan_mode in ('self', 'guided')),
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "users_read_own_subscription" on public.subscriptions;
create policy "users_read_own_subscription" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.subscriptions, public.stripe_webhook_events to service_role;

create or replace function public.has_active_plan(required_plan text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_billing_enabled() or exists (
    select 1
    from public.subscriptions s
    where s.user_id = (select auth.uid())
      and s.status in ('active', 'trialing')
      and (required_plan is null or s.plan_mode = required_plan)
  );
$$;

revoke execute on function public.has_active_plan(text) from public, anon;
grant execute on function public.has_active_plan(text) to authenticated, service_role;

-- Webhooks chamam esta função com a service role. O evento e o estado da
-- assinatura são gravados na mesma transação, permitindo reenvios seguros.
create or replace function public.process_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_plan_mode text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
begin
  if exists (select 1 from public.stripe_webhook_events where event_id = p_event_id) then
    return false;
  end if;

  if p_plan_mode not in ('self', 'guided') then
    raise exception 'Unknown billing plan';
  end if;

  if v_user_id is null then
    select user_id into v_user_id
    from public.subscriptions
    where stripe_subscription_id = p_subscription_id
       or stripe_customer_id = p_customer_id
    limit 1;
  end if;

  if v_user_id is null then
    raise exception 'Subscription user could not be resolved';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type)
  values (p_event_id, p_event_type);

  insert into public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    plan_mode, status, current_period_end, cancel_at_period_end
  ) values (
    v_user_id, p_customer_id, p_subscription_id, p_price_id,
    p_plan_mode, p_status, p_current_period_end, coalesce(p_cancel_at_period_end, false)
  )
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    plan_mode = excluded.plan_mode,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end;

  return true;
end;
$$;

revoke execute on function public.process_stripe_subscription_event(text, text, uuid, text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.process_stripe_subscription_event(text, text, uuid, text, text, text, text, text, timestamptz, boolean) to service_role;

-- A assinatura precisa ser validada também no banco; esconder a tela não é
-- suficiente, porque o cliente pode chamar a API do Supabase diretamente.
drop policy if exists "users_manage_own_plan" on public.plan_preferences;
create policy "users_read_own_plan" on public.plan_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users_insert_own_active_plan" on public.plan_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_active_plan(plan_mode));
create policy "users_update_own_active_plan" on public.plan_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.has_active_plan(plan_mode));
create policy "users_delete_own_plan" on public.plan_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users_manage_own_self_plan" on public.self_plans;
create policy "users_read_own_active_self_plan" on public.self_plans
  for select to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan('self'));
create policy "users_insert_own_active_self_plan" on public.self_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_active_plan('self'));
create policy "users_update_own_active_self_plan" on public.self_plans
  for update to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan('self'))
  with check ((select auth.uid()) = user_id and public.has_active_plan('self'));
create policy "users_delete_own_self_plan" on public.self_plans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users_read_own_generated_plan" on public.generated_plans;
drop policy if exists "users_update_own_generated_plan" on public.generated_plans;
create policy "users_read_own_active_generated_plan" on public.generated_plans
  for select to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan('guided'));
create policy "users_update_own_active_generated_plan" on public.generated_plans
  for update to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan('guided'))
  with check ((select auth.uid()) = user_id and public.has_active_plan('guided'));
