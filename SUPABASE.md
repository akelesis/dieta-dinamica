# Backend Supabase do VivaMeta

O projeto está preparado para usar o Supabase como backend principal:

- Supabase Auth para cadastro, login e sessão;
- Postgres com RLS para perfil, preferências do plano, diário e refeições;
- Edge Function `food-estimate` para estimar alimentos sem expor a chave;
- Edge Function `analyze-meal-image` para identificar alimentos e porções visíveis em fotos sem armazenar a imagem;
- Edge Function `generate-plan` para criar o rascunho de planos com pratos, porções e macros estruturados;
- fila privada e anonimizada para revisão das dietas do Plano Plus;
- Edge Function `nutritionist-reviews` para edição profissional, aprovação e geração posterior do modo de preparo;
- cache compartilhado de refeições completas e itens alimentares no Postgres;
- fallback local Express + SQLite enquanto as variáveis Supabase não estiverem configuradas.

## Conectar um projeto

Crie um projeto no painel do Supabase e execute, na raiz deste repositório:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase secrets set OPENAI_API_KEY="SUA_CHAVE_OPENAI" OPENAI_MODEL="gpt-5.6" OPENAI_VISION_MODEL="gpt-5.6" OPENAI_PLAN_MODEL="gpt-5.4-mini"
npx supabase functions deploy food-estimate
npx supabase functions deploy analyze-meal-image
npx supabase functions deploy generate-plan
npx supabase functions deploy meal-swaps
npx supabase functions deploy nutritionist-reviews
```

Crie ou atualize o `.env` local com os valores exibidos em **Project Settings > API**:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Reinicie `npm run dev` depois de alterar o `.env`.

## Segurança

A chave da OpenAI fica somente nos secrets da Edge Function. A publishable key do Supabase pode ser usada no navegador porque as tabelas do usuário estão protegidas por RLS. As tabelas de cache não têm políticas para usuários e só podem ser acessadas pela função com a chave secreta do projeto.

## Acesso beta sem cobrança

Os e-mails autorizados ficam na tabela privada `beta_access_emails`. Ela não pode ser lida pelo frontend; apenas a `service_role` e o SQL Editor podem gerenciá-la. O plano `guided` libera o Plano Plus e `self` libera o Plano Básico.

Adicionar ou atualizar participantes pelo SQL Editor:

```sql
insert into public.beta_access_emails (email, plan_mode, expires_at, note)
values
  ('beta1@exemplo.com', 'guided', null, 'Turma beta inicial'),
  ('beta2@exemplo.com', 'self', '2026-12-31 23:59:59+00', 'Acesso temporário')
on conflict (email) do update set
  plan_mode = excluded.plan_mode,
  expires_at = excluded.expires_at,
  active = true,
  note = excluded.note;
```

Desativar um acesso sem apagar o histórico:

```sql
update public.beta_access_emails
set active = false
where email = 'beta1@exemplo.com';
```

O bypass é validado no banco, no frontend e nas Edge Functions. E-mails inativos ou com `expires_at` vencido voltam automaticamente para a tela de seleção de planos.

## Contas de nutricionista

O painel profissional não é liberado por e-mail no frontend. A conta deve existir no Supabase Auth e ser vinculada na tabela privada `nutritionist_accounts`. No SQL Editor, use:

```sql
insert into public.nutritionist_accounts (user_id, display_name, registration_number)
select id, 'Nome profissional', 'CRN-00 00000'
from auth.users
where lower(email) = lower('nutricionista@exemplo.com')
on conflict (user_id) do update set
  display_name = excluded.display_name,
  registration_number = excluded.registration_number,
  active = true;
```

Depois do login, essa conta entra diretamente no painel de dietas. A função só retorna um código de caso e o contexto necessário para revisão; nome, e-mail e `user_id` não são enviados à interface profissional.

O rascunho não contém modo de preparo. Ao aprovar, a Edge Function envia somente o cardápio confirmado à OpenAI, adiciona os preparos e publica a versão final para o usuário. O ciclo da assinatura impede uma segunda solicitação antes da renovação.

## Migração gradual

Sem as variáveis `VITE_SUPABASE_*`, o frontend mantém o comportamento anterior: dados no `localStorage` e análise de alimentos pela API Express local. Isso permite validar o Supabase antes de retirar `server/`, SQLite e o proxy do Vite.
