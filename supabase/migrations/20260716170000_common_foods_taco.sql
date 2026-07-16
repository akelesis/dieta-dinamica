create table if not exists public.common_foods (
  food_key text primary key,
  display_name text not null,
  aliases text[] not null check (cardinality(aliases) > 0),
  preparation text not null,
  kcal_per_100g numeric(7,2) not null check (kcal_per_100g >= 0),
  protein_per_100g numeric(7,2) not null check (protein_per_100g >= 0),
  carbs_per_100g numeric(7,2) not null check (carbs_per_100g >= 0),
  fat_per_100g numeric(7,2) not null check (fat_per_100g >= 0),
  source_name text not null,
  source_code integer,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists common_foods_aliases_idx on public.common_foods using gin (aliases);

drop trigger if exists common_foods_updated_at on public.common_foods;
create trigger common_foods_updated_at before update on public.common_foods
for each row execute function public.set_updated_at();

alter table public.common_foods enable row level security;
drop policy if exists "authenticated_read_common_foods" on public.common_foods;
create policy "authenticated_read_common_foods" on public.common_foods
for select to authenticated using (true);

insert into public.common_foods
  (food_key, display_name, aliases, preparation, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source_name, source_code, source_url)
values
  ('arroz-integral-cozido', 'Arroz integral cozido', array['arroz integral', 'arroz integral cozido'], 'cozido', 123.53, 2.59, 25.81, 1.00, 'TACO 4ª edição', 1, 'https://nepa.unicamp.br/publicacoes/'),
  ('arroz-branco-cozido', 'Arroz branco cozido', array['arroz branco', 'arroz branco cozido', 'arroz cozido', 'arroz tipo 1 cozido'], 'cozido', 128.26, 2.52, 28.06, 0.23, 'TACO 4ª edição', 3, 'https://nepa.unicamp.br/publicacoes/'),
  ('aveia-flocos-crua', 'Aveia em flocos', array['aveia', 'aveia em floco', 'aveia floco', 'aveia floco crua'], 'crua', 393.82, 13.92, 66.64, 8.50, 'TACO 4ª edição', 7, 'https://nepa.unicamp.br/publicacoes/'),
  ('pao-integral', 'Pão de forma integral', array['pao integral', 'pao de forma integral', 'pao trigo forma integral'], 'pronto para consumo', 253.19, 9.43, 49.94, 3.65, 'TACO 4ª edição', 52, 'https://nepa.unicamp.br/publicacoes/'),
  ('pao-frances', 'Pão francês', array['pao frances', 'pao de sal', 'pao trigo frances'], 'pronto para consumo', 299.81, 7.95, 58.65, 3.10, 'TACO 4ª edição', 53, 'https://nepa.unicamp.br/publicacoes/'),
  ('abobora-cabotia-cozida', 'Abóbora cabotiá cozida', array['abobora cabotia', 'abobora cabotia cozida', 'abobora cabotian cozida'], 'cozida', 48.04, 1.44, 10.76, 0.73, 'TACO 4ª edição', 64, 'https://nepa.unicamp.br/publicacoes/'),
  ('alface-crespa-crua', 'Alface crespa crua', array['alface crespa', 'alface crespa crua', 'alface crua'], 'crua', 10.68, 1.35, 1.70, 0.16, 'TACO 4ª edição', 78, 'https://nepa.unicamp.br/publicacoes/'),
  ('batata-doce-cozida', 'Batata-doce cozida', array['batata doce', 'batata doce cozida'], 'cozida', 76.76, 0.64, 18.42, 0.09, 'TACO 4ª edição', 88, 'https://nepa.unicamp.br/publicacoes/'),
  ('batata-inglesa-cozida', 'Batata inglesa cozida', array['batata cozida', 'batata inglesa', 'batata inglesa cozida'], 'cozida', 51.59, 1.16, 11.94, 0.00, 'TACO 4ª edição', 91, 'https://nepa.unicamp.br/publicacoes/'),
  ('batata-inglesa-frita', 'Batata inglesa frita', array['batata frita', 'batata inglesa frita'], 'frita', 267.16, 4.97, 35.64, 13.11, 'TACO 4ª edição', 93, 'https://nepa.unicamp.br/publicacoes/'),
  ('brocolis-cozido', 'Brócolis cozido', array['brocoli cozido', 'brocolis cozido'], 'cozido', 24.64, 2.13, 4.37, 0.46, 'TACO 4ª edição', 100, 'https://nepa.unicamp.br/publicacoes/'),
  ('cebola-crua', 'Cebola crua', array['cebola', 'cebola crua'], 'crua', 39.42, 1.71, 8.85, 0.08, 'TACO 4ª edição', 107, 'https://nepa.unicamp.br/publicacoes/'),
  ('cenoura-cozida', 'Cenoura cozida', array['cenoura cozida'], 'cozida', 29.86, 0.85, 6.69, 0.22, 'TACO 4ª edição', 109, 'https://nepa.unicamp.br/publicacoes/'),
  ('couve-manteiga-crua', 'Couve-manteiga crua', array['couve crua', 'couve manteiga', 'couve manteiga crua'], 'crua', 27.06, 2.87, 4.33, 0.55, 'TACO 4ª edição', 115, 'https://nepa.unicamp.br/publicacoes/'),
  ('couve-manteiga-refogada', 'Couve-manteiga refogada', array['couve refogada', 'couve manteiga refogada'], 'refogada', 90.34, 1.67, 8.71, 6.59, 'TACO 4ª edição', 116, 'https://nepa.unicamp.br/publicacoes/'),
  ('mandioca-cozida', 'Mandioca cozida', array['aipim cozido', 'macaxeira cozida', 'mandioca cozida'], 'cozida', 125.36, 0.58, 30.09, 0.30, 'TACO 4ª edição', 129, 'https://nepa.unicamp.br/publicacoes/'),
  ('tomate-cru', 'Tomate cru', array['tomate', 'tomate cru', 'tomate com semente cru'], 'cru', 15.34, 1.10, 3.14, 0.17, 'TACO 4ª edição', 157, 'https://nepa.unicamp.br/publicacoes/'),
  ('abacate-cru', 'Abacate cru', array['abacate', 'abacate cru'], 'cru', 96.15, 1.24, 6.03, 8.40, 'TACO 4ª edição', 163, 'https://nepa.unicamp.br/publicacoes/'),
  ('banana-maca-crua', 'Banana-maçã crua', array['banana maca', 'banana maca crua'], 'crua', 86.81, 1.75, 22.34, 0.06, 'TACO 4ª edição', 178, 'https://nepa.unicamp.br/publicacoes/'),
  ('banana-nanica-crua', 'Banana-nanica crua', array['banana nanica', 'banana nanica crua'], 'crua', 91.53, 1.40, 23.85, 0.12, 'TACO 4ª edição', 179, 'https://nepa.unicamp.br/publicacoes/'),
  ('banana-prata-crua', 'Banana-prata crua', array['banana prata', 'banana prata crua'], 'crua', 98.25, 1.27, 25.96, 0.07, 'TACO 4ª edição', 182, 'https://nepa.unicamp.br/publicacoes/'),
  ('laranja-pera-crua', 'Laranja-pera crua', array['laranja pera', 'laranja pera crua'], 'crua', 36.77, 1.04, 8.95, 0.13, 'TACO 4ª edição', 214, 'https://nepa.unicamp.br/publicacoes/'),
  ('maca-fuji-crua', 'Maçã Fuji com casca', array['maca fuji', 'maca fuji com casca', 'maca fuji crua'], 'crua com casca', 55.52, 0.29, 15.15, 0.00, 'TACO 4ª edição', 222, 'https://nepa.unicamp.br/publicacoes/'),
  ('mamao-papaia-cru', 'Mamão papaia cru', array['mamao papaia', 'mamao papaia cru'], 'cru', 40.16, 0.46, 10.44, 0.12, 'TACO 4ª edição', 226, 'https://nepa.unicamp.br/publicacoes/'),
  ('manga-palmer-crua', 'Manga Palmer crua', array['manga palmer', 'manga palmer crua'], 'crua', 72.49, 0.41, 19.35, 0.17, 'TACO 4ª edição', 229, 'https://nepa.unicamp.br/publicacoes/'),
  ('morango-cru', 'Morango cru', array['morango', 'morango cru'], 'cru', 30.15, 0.89, 6.82, 0.31, 'TACO 4ª edição', 239, 'https://nepa.unicamp.br/publicacoes/'),
  ('uva-italia-crua', 'Uva Itália crua', array['uva italia', 'uva italia crua'], 'crua', 52.87, 0.75, 13.57, 0.20, 'TACO 4ª edição', 256, 'https://nepa.unicamp.br/publicacoes/'),
  ('azeite-oliva', 'Azeite de oliva extravirgem', array['azeite', 'azeite de oliva', 'azeite oliva extra virgem'], 'pronto para consumo', 884.00, 0.00, 0.00, 100.00, 'TACO 4ª edição', 260, 'https://nepa.unicamp.br/publicacoes/'),
  ('manteiga-com-sal', 'Manteiga com sal', array['manteiga', 'manteiga com sal'], 'pronta para consumo', 725.97, 0.41, 0.06, 82.36, 'TACO 4ª edição', 261, 'https://nepa.unicamp.br/publicacoes/'),
  ('oleo-soja', 'Óleo de soja', array['oleo de soja', 'oleo soja'], 'pronto para consumo', 884.00, 0.00, 0.00, 100.00, 'TACO 4ª edição', 272, 'https://nepa.unicamp.br/publicacoes/'),
  ('atum-conserva-oleo', 'Atum em conserva em óleo', array['atum em conserva em oleo', 'atum conserva oleo'], 'em conserva', 165.91, 26.19, 0.00, 6.00, 'TACO 4ª edição', 277, 'https://nepa.unicamp.br/publicacoes/'),
  ('salmao-grelhado', 'Salmão grelhado com pele', array['salmao grelhado', 'file de salmao grelhado', 'salmao com pele grelhado'], 'grelhado', 228.73, 23.92, 0.00, 14.04, 'TACO 4ª edição', 315, 'https://nepa.unicamp.br/publicacoes/'),
  ('acem-cozido', 'Acém bovino sem gordura cozido', array['acem cozido', 'acem sem gordura cozido', 'carne bovina acem cozida'], 'cozido', 214.61, 27.27, 0.00, 10.88, 'TACO 4ª edição', 328, 'https://nepa.unicamp.br/publicacoes/'),
  ('patinho-grelhado', 'Patinho bovino sem gordura grelhado', array['patinho grelhado', 'patinho sem gordura grelhado', 'carne bovina patinho grelhada'], 'grelhado', 219.26, 35.90, 0.00, 7.31, 'TACO 4ª edição', 377, 'https://nepa.unicamp.br/publicacoes/'),
  ('peito-frango-cozido', 'Peito de frango sem pele cozido', array['frango cozido', 'peito de frango cozido', 'peito frango sem pele cozido'], 'cozido', 162.87, 31.47, 0.00, 3.16, 'TACO 4ª edição', 408, 'https://nepa.unicamp.br/publicacoes/'),
  ('peito-frango-grelhado', 'Peito de frango sem pele grelhado', array['frango grelhado', 'peito de frango grelhado', 'peito frango sem pele grelhado'], 'grelhado', 159.19, 32.03, 0.00, 2.48, 'TACO 4ª edição', 410, 'https://nepa.unicamp.br/publicacoes/'),
  ('iogurte-natural', 'Iogurte natural integral', array['iogurte natural', 'iogurte natural integral'], 'pronto para consumo', 51.49, 4.06, 1.92, 3.04, 'TACO 4ª edição', 448, 'https://nepa.unicamp.br/publicacoes/'),
  ('iogurte-natural-desnatado', 'Iogurte natural desnatado', array['iogurte desnatado', 'iogurte natural desnatado'], 'pronto para consumo', 41.49, 3.83, 5.77, 0.32, 'TACO 4ª edição', 449, 'https://nepa.unicamp.br/publicacoes/'),
  ('queijo-minas-frescal', 'Queijo minas frescal', array['queijo minas', 'queijo minas frescal'], 'pronto para consumo', 264.27, 17.41, 3.24, 20.18, 'TACO 4ª edição', 461, 'https://nepa.unicamp.br/publicacoes/'),
  ('queijo-mucarela', 'Queijo muçarela', array['mucarela', 'queijo mucarela', 'queijo mozarela', 'mozarela'], 'pronto para consumo', 329.87, 22.65, 3.05, 25.18, 'TACO 4ª edição', 463, 'https://nepa.unicamp.br/publicacoes/'),
  ('requeijao-cremoso', 'Requeijão cremoso', array['requeijao', 'requeijao cremoso', 'queijo requeijao cremoso'], 'pronto para consumo', 256.58, 9.63, 2.43, 23.44, 'TACO 4ª edição', 468, 'https://nepa.unicamp.br/publicacoes/'),
  ('ricota', 'Ricota', array['queijo ricota', 'ricota'], 'pronta para consumo', 139.73, 12.60, 3.79, 8.11, 'TACO 4ª edição', 469, 'https://nepa.unicamp.br/publicacoes/'),
  ('cafe-infusao', 'Café coado sem açúcar', array['cafe coado sem acucar', 'cafe infusao sem acucar', 'cafe sem acucar'], 'infusão 10%', 9.07, 0.71, 1.48, 0.07, 'TACO 4ª edição', 471, 'https://nepa.unicamp.br/publicacoes/'),
  ('ovo-cozido', 'Ovo de galinha cozido', array['ovo cozido', 'ovo de galinha cozido'], 'cozido por 10 minutos', 145.70, 13.29, 0.61, 9.48, 'TACO 4ª edição', 488, 'https://nepa.unicamp.br/publicacoes/'),
  ('ovo-frito', 'Ovo de galinha frito', array['ovo frito', 'ovo de galinha frito'], 'frito', 240.19, 15.62, 1.19, 18.59, 'TACO 4ª edição', 490, 'https://nepa.unicamp.br/publicacoes/'),
  ('acucar-cristal', 'Açúcar cristal', array['acucar', 'acucar cristal'], 'pronto para consumo', 386.85, 0.32, 99.61, 0.00, 'TACO 4ª edição', 492, 'https://nepa.unicamp.br/publicacoes/'),
  ('cuscuz-milho-cozido', 'Cuscuz de milho cozido', array['cuscuz', 'cuscuz cozido', 'cuscuz de milho', 'cuscuz de milho cozido'], 'cozido com sal', 113.46, 2.16, 25.28, 0.68, 'TACO 4ª edição', 533, 'https://nepa.unicamp.br/publicacoes/'),
  ('amendoim-cru', 'Amendoim cru', array['amendoim', 'amendoim cru', 'amendoim grao cru'], 'cru', 544.05, 27.19, 20.31, 43.85, 'TACO 4ª edição', 557, 'https://nepa.unicamp.br/publicacoes/'),
  ('feijao-carioca-cozido', 'Feijão carioca cozido', array['feijao carioca', 'feijao carioca cozido'], 'cozido', 76.42, 4.78, 13.59, 0.54, 'TACO 4ª edição', 561, 'https://nepa.unicamp.br/publicacoes/'),
  ('feijao-preto-cozido', 'Feijão preto cozido', array['feijao preto', 'feijao preto cozido'], 'cozido', 77.03, 4.48, 14.01, 0.54, 'TACO 4ª edição', 567, 'https://nepa.unicamp.br/publicacoes/'),
  ('lentilha-cozida', 'Lentilha cozida', array['lentilha', 'lentilha cozida'], 'cozida', 92.64, 6.31, 16.30, 0.52, 'TACO 4ª edição', 577, 'https://nepa.unicamp.br/publicacoes/'),
  ('tofu', 'Tofu', array['queijo de soja', 'tofu'], 'pronto para consumo', 64.49, 6.55, 2.13, 3.95, 'TACO 4ª edição', 584, 'https://nepa.unicamp.br/publicacoes/'),
  ('castanha-caju-torrada', 'Castanha-de-caju torrada', array['castanha de caju', 'castanha de caju torrada'], 'torrada e salgada', 570.17, 18.51, 29.13, 46.28, 'TACO 4ª edição', 588, 'https://nepa.unicamp.br/publicacoes/'),
  ('castanha-brasil-crua', 'Castanha-do-Brasil crua', array['castanha do brasil', 'castanha do para', 'castanha do brasil crua'], 'crua', 642.96, 14.54, 15.08, 63.46, 'TACO 4ª edição', 589, 'https://nepa.unicamp.br/publicacoes/')
on conflict (food_key) do update set
  display_name = excluded.display_name,
  aliases = excluded.aliases,
  preparation = excluded.preparation,
  kcal_per_100g = excluded.kcal_per_100g,
  protein_per_100g = excluded.protein_per_100g,
  carbs_per_100g = excluded.carbs_per_100g,
  fat_per_100g = excluded.fat_per_100g,
  source_name = excluded.source_name,
  source_code = excluded.source_code,
  source_url = excluded.source_url;
