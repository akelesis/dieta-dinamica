# VivaMeta

Aplicação de acompanhamento alimentar com plano individualizado, diário de refeições, meta calórica diária baseada na média semanal de treinos e estimativas nutricionais assistidas por IA.

## Funcionalidades

- cadastro e autenticação com Supabase;
- onboarding de perfil, objetivo, atividade cotidiana e rotina de treinos;
- plano alimentar gerado por IA com porções, calorias e macronutrientes;
- personalização de refeições com adição, exclusão e sugestões de troca;
- triagem estruturada de comorbidades e bloqueio clínico para condições renais que exigem exames e acompanhamento profissional;
- diário alimentar com estimativa de calorias, proteínas e carboidratos;
- catálogo de alimentos comuns baseado na TACO/Unicamp, com kcal e macronutrientes por 100 g;
- cálculo determinístico pela quantidade e cache de alimentos antes de recorrer à IA;
- meta diária estável, com o gasto estimado dos treinos semanais distribuído pelos sete dias;
- registro de realização do treino sem alterar a meta calórica do dia.

## Tecnologias

- React, TypeScript e Vite;
- Supabase Auth, Postgres, RLS e Edge Functions;
- OpenAI Responses API com saída estruturada;
- Vercel para hospedagem do frontend.

## Desenvolvimento local

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

O frontend fica disponível em `http://127.0.0.1:5173` e a API local de fallback em `http://127.0.0.1:8787`.

## Variáveis do frontend

Para usar o Supabase, configure:

```dotenv
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave
```

A chave da OpenAI não deve ser exposta no frontend. Em produção, ela fica armazenada nos secrets das Edge Functions do Supabase.

## Verificação

```powershell
npm run build
npm run lint
npm test
```

Consulte [SUPABASE.md](./SUPABASE.md) para configurar banco, migrações e Edge Functions.
