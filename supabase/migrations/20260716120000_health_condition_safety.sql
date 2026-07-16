-- Condições são categorizadas para regras determinísticas de segurança.
alter table public.plan_preferences
  add column if not exists health_conditions text[] not null default '{}';

alter table public.plan_preferences
  add constraint plan_preferences_health_conditions_check
  check (health_conditions <@ array['diabetes', 'hypertension', 'kidney_disease', 'liver_disease', 'heart_disease', 'other']::text[]);
