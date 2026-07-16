-- O cache por alimento passa a armazenar também os macronutrientes por porção.
alter table public.food_item_cache
  add column if not exists base_protein numeric not null default 0 check (base_protein >= 0),
  add column if not exists base_carbs numeric not null default 0 check (base_carbs >= 0),
  add column if not exists base_fat numeric not null default 0 check (base_fat >= 0);
