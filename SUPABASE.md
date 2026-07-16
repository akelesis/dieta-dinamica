# Backend Supabase do VivaMeta

O projeto está preparado para usar o Supabase como backend principal:

- Supabase Auth para cadastro, login e sessão;
- Postgres com RLS para perfil, preferências do plano, diário e refeições;
- Edge Function `food-estimate` para estimar alimentos sem expor a chave;
- Edge Function `generate-plan` para criar planos com pratos, porções e macros estruturados;
- Edge Function `meal-swaps` para criar três alternativas completas e equivalentes para cada refeição;
- personalizações do plano (exclusão, adição e troca de alimentos) salvas no Postgres com RLS;
- cache compartilhado de refeições completas e itens alimentares no Postgres;
- fallback local Express + SQLite enquanto as variáveis Supabase não estiverem configuradas.

## Conectar um projeto

Crie um projeto no painel do Supabase e execute, na raiz deste repositório:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase secrets set OPENAI_API_KEY="SUA_CHAVE_OPENAI" OPENAI_MODEL="gpt-5.6" OPENAI_PLAN_MODEL="gpt-5.4-mini"
npx supabase functions deploy food-estimate
npx supabase functions deploy generate-plan
npx supabase functions deploy meal-swaps
```

Crie ou atualize o `.env` local com os valores exibidos em **Project Settings > API**:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Reinicie `npm run dev` depois de alterar o `.env`.

## Segurança

A chave da OpenAI fica somente nos secrets da Edge Function. A publishable key do Supabase pode ser usada no navegador porque as tabelas do usuário estão protegidas por RLS. As tabelas de cache não têm políticas para usuários e só podem ser acessadas pela função com a chave secreta do projeto.

## Migração gradual

Sem as variáveis `VITE_SUPABASE_*`, o frontend mantém o comportamento anterior: dados no `localStorage` e análise de alimentos pela API Express local. Isso permite validar o Supabase antes de retirar `server/`, SQLite e o proxy do Vite.
