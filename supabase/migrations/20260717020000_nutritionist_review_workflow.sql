alter table public.subscriptions
  add column if not exists current_period_start timestamptz;

create table if not exists public.nutritionist_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  registration_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diet_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_key text not null,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'approved')),
  context_snapshot jsonb not null,
  draft_plan jsonb not null,
  approved_plan jsonb,
  input_hash text not null,
  source_model text not null,
  preparation_model text,
  reviewer_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  claimed_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_key)
);

create index if not exists diet_reviews_queue_idx
  on public.diet_reviews (status, submitted_at);

drop trigger if exists nutritionist_accounts_updated_at on public.nutritionist_accounts;
create trigger nutritionist_accounts_updated_at before update on public.nutritionist_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists diet_reviews_updated_at on public.diet_reviews;
create trigger diet_reviews_updated_at before update on public.diet_reviews
  for each row execute function public.set_updated_at();

alter table public.nutritionist_accounts enable row level security;
alter table public.diet_reviews enable row level security;

revoke all on public.nutritionist_accounts from public, anon, authenticated;
revoke all on public.diet_reviews from public, anon, authenticated;
grant all on public.nutritionist_accounts, public.diet_reviews to service_role;

create policy "users_read_own_diet_reviews" on public.diet_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan('guided'));
grant select on public.diet_reviews to authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.nutritionist_accounts n
    where n.user_id = (select auth.uid()) and n.active
  ) then 'nutritionist' else 'user' end;
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

drop policy if exists "users_update_own_generated_plan" on public.generated_plans;
drop policy if exists "users_update_own_active_generated_plan" on public.generated_plans;
revoke update on public.generated_plans from authenticated;

drop function if exists public.process_stripe_subscription_event(text, text, uuid, text, text, text, text, text, timestamptz, boolean);
create function public.process_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_plan_mode text,
  p_status text,
  p_current_period_start timestamptz,
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
  if exists (select 1 from public.stripe_webhook_events where event_id = p_event_id) then return false; end if;
  if p_plan_mode not in ('self', 'guided') then raise exception 'Unknown billing plan'; end if;
  if v_user_id is null then
    select user_id into v_user_id from public.subscriptions
    where stripe_subscription_id = p_subscription_id or stripe_customer_id = p_customer_id limit 1;
  end if;
  if v_user_id is null then raise exception 'Subscription user could not be resolved'; end if;

  insert into public.stripe_webhook_events (event_id, event_type) values (p_event_id, p_event_type);
  insert into public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_mode, status,
    current_period_start, current_period_end, cancel_at_period_end
  ) values (
    v_user_id, p_customer_id, p_subscription_id, p_price_id, p_plan_mode, p_status,
    p_current_period_start, p_current_period_end, coalesce(p_cancel_at_period_end, false)
  )
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    plan_mode = excluded.plan_mode,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_checkout_session_id = null,
    checkout_url = null,
    checkout_expires_at = null;
  return true;
end;
$$;

revoke execute on function public.process_stripe_subscription_event(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.process_stripe_subscription_event(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) to service_role;
