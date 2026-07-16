alter table public.common_foods
  add column if not exists hit_count bigint not null default 0,
  add column if not exists last_used_at timestamptz;

create or replace function public.record_common_food_hits(p_food_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.common_foods
    set hit_count = hit_count + 1, last_used_at = now()
    where food_key = any(p_food_keys);
  update public.food_cache_metrics
    set value = value + 1
    where name = 'saved_requests';
end;
$$;

revoke all on function public.record_common_food_hits(text[]) from public;
grant execute on function public.record_common_food_hits(text[]) to service_role;
