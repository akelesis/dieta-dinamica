create table if not exists public.beta_access_emails (
  email text primary key,
  plan_mode text not null default 'guided' check (plan_mode in ('self', 'guided')),
  active boolean not null default true,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists beta_access_emails_lower_email_idx
  on public.beta_access_emails (lower(email));

create or replace function public.normalize_beta_access_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists beta_access_emails_normalize on public.beta_access_emails;
create trigger beta_access_emails_normalize
  before insert or update of email on public.beta_access_emails
  for each row execute function public.normalize_beta_access_email();

drop trigger if exists beta_access_emails_updated_at on public.beta_access_emails;
create trigger beta_access_emails_updated_at
  before update on public.beta_access_emails
  for each row execute function public.set_updated_at();

alter table public.beta_access_emails enable row level security;
revoke all on public.beta_access_emails from public, anon, authenticated;
grant all on public.beta_access_emails to service_role;

create or replace function public.beta_plan_for_current_user()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.plan_mode
  from public.beta_access_emails b
  where lower(b.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
    and b.active
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
$$;

revoke execute on function public.beta_plan_for_current_user() from public, anon;
grant execute on function public.beta_plan_for_current_user() to authenticated, service_role;

create or replace function public.has_active_plan(required_plan text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_billing_enabled()
    or exists (
      select 1
      from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
        and (required_plan is null or s.plan_mode = required_plan)
    )
    or exists (
      select 1
      from public.beta_access_emails b
      where lower(b.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
        and b.active
        and (b.expires_at is null or b.expires_at > now())
        and (required_plan is null or b.plan_mode = required_plan)
    );
$$;

revoke execute on function public.has_active_plan(text) from public, anon;
grant execute on function public.has_active_plan(text) to authenticated, service_role;

comment on table public.beta_access_emails is
  'Lista privada de e-mails com acesso beta sem cobrança. Gerenciada somente com service_role ou pelo SQL Editor.';
