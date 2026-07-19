alter table public.plan_preferences
  add column if not exists workout_time time,
  add column if not exists breakfast_availability text not null default 'comfortable',
  add column if not exists lunch_availability text not null default 'comfortable',
  add column if not exists dinner_availability text not null default 'comfortable';

alter table public.plan_preferences
  drop constraint if exists plan_preferences_breakfast_availability_check,
  drop constraint if exists plan_preferences_lunch_availability_check,
  drop constraint if exists plan_preferences_dinner_availability_check;

alter table public.plan_preferences
  add constraint plan_preferences_breakfast_availability_check
    check (breakfast_availability in ('comfortable', 'limited', 'very_limited')),
  add constraint plan_preferences_lunch_availability_check
    check (lunch_availability in ('comfortable', 'limited', 'very_limited')),
  add constraint plan_preferences_dinner_availability_check
    check (dinner_availability in ('comfortable', 'limited', 'very_limited'));
