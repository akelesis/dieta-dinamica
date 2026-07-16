alter table public.subscriptions
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists checkout_url text,
  add column if not exists checkout_expires_at timestamptz;

-- Estes campos existem somente para devolver a mesma sessão pendente em caso
-- de clique duplo ou duas abas. Eles são apagados quando o webhook confirma a
-- criação da assinatura.
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
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_checkout_session_id = null,
    checkout_url = null,
    checkout_expires_at = null;

  return true;
end;
$$;
