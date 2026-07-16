-- Separa a movimentação cotidiana dos exercícios registrados pelo usuário.
alter table public.profiles
  add column if not exists daily_activity text not null default 'light'
  check (daily_activity in ('sedentary', 'light', 'active', 'heavy'));
