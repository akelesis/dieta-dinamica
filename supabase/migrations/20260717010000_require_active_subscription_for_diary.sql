-- O perfil permanece acessível para que novos usuários concluam o onboarding.
-- Diário e refeições só ficam disponíveis depois da ativação da assinatura.
drop policy if exists "users_manage_own_days" on public.day_logs;
drop policy if exists "users_read_own_active_days" on public.day_logs;
drop policy if exists "users_insert_own_active_days" on public.day_logs;
drop policy if exists "users_update_own_active_days" on public.day_logs;
drop policy if exists "users_delete_own_active_days" on public.day_logs;

create policy "users_read_own_active_days" on public.day_logs
  for select to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan());
create policy "users_insert_own_active_days" on public.day_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_active_plan());
create policy "users_update_own_active_days" on public.day_logs
  for update to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan())
  with check ((select auth.uid()) = user_id and public.has_active_plan());
create policy "users_delete_own_active_days" on public.day_logs
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan());

drop policy if exists "users_read_own_meals" on public.meal_entries;
drop policy if exists "users_insert_own_meals" on public.meal_entries;
drop policy if exists "users_update_own_meals" on public.meal_entries;
drop policy if exists "users_delete_own_meals" on public.meal_entries;
drop policy if exists "users_read_own_active_meals" on public.meal_entries;
drop policy if exists "users_insert_own_active_meals" on public.meal_entries;
drop policy if exists "users_update_own_active_meals" on public.meal_entries;
drop policy if exists "users_delete_own_active_meals" on public.meal_entries;

create policy "users_read_own_active_meals" on public.meal_entries
  for select to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan());
create policy "users_insert_own_active_meals" on public.meal_entries
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.has_active_plan()
    and exists (
      select 1 from public.day_logs d
      where d.id = day_log_id and d.user_id = (select auth.uid())
    )
  );
create policy "users_update_own_active_meals" on public.meal_entries
  for update to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan())
  with check (
    (select auth.uid()) = user_id
    and public.has_active_plan()
    and exists (
      select 1 from public.day_logs d
      where d.id = day_log_id and d.user_id = (select auth.uid())
    )
  );
create policy "users_delete_own_active_meals" on public.meal_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.has_active_plan());
