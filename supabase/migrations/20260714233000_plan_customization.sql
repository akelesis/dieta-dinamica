-- Permite que o usuário salve apenas o JSON personalizado do próprio plano.
create policy "users_update_own_generated_plan" on public.generated_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant update (plan_json, updated_at) on public.generated_plans to authenticated;
