# Configurar o Supabase no Focus

Você precisa fazer apenas os passos abaixo uma vez.

## 1. Criar a tabela

1. Abra seu projeto no Supabase.
2. No menu esquerdo, clique em **SQL Editor**.
3. Clique em **New query**.
4. Abra o arquivo `supabase.sql` deste repositório e copie todo o conteúdo.
5. Cole no SQL Editor e clique em **Run**.
6. Deve aparecer a mensagem **Success. No rows returned**. Isso é normal.

## 2. Copiar os dois dados públicos

1. Volte para a tela inicial do projeto no Supabase.
2. Clique no botão **Connect**, na parte superior.
3. No menu **App Frameworks** ou **API Keys**, copie:
   - **Project URL**;
   - **Publishable key** (`sb_publishable_...`). Em projetos antigos, use **anon public**.
4. Abra `supabase-config.js` e substitua somente os textos entre aspas:

```js
const FOCUS_SUPABASE_URL = 'SUA_URL_AQUI';
const FOCUS_SUPABASE_PUBLIC_KEY = 'SUA_CHAVE_PUBLICAVEL_AQUI';
```

Nunca copie a `service_role` ou qualquer chave marcada como secret.

## 3. Conferir o login por e-mail

1. No menu esquerdo do Supabase, abra **Authentication**.
2. Entre em **Providers** e confirme que **Email** está habilitado.
3. Em **URL Configuration**, use como **Site URL** o endereço publicado do seu site.

Quando **Confirm email** estiver habilitado, uma conta nova só poderá entrar depois de clicar no link recebido por e-mail.

## 4. Testar

1. Publique os arquivos ou abra o projeto usando o Live Server do VS Code.
2. Acesse `login.html`.
3. Crie uma conta.
4. Adicione ou altere uma tarefa.
5. No Supabase, abra **Table Editor > focus_user_states**. Uma linha deve aparecer para o usuário.

O Focus continuará mantendo uma cópia no navegador e também salvará tarefas, blocos, subtarefas e a sessão do modo foco no Supabase.
