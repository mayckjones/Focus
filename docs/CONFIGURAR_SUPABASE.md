# Configurar o Supabase no Foque em Checks

Você precisa fazer apenas os passos abaixo uma vez.

## 1. Criar a tabela

1. Abra seu projeto no Supabase.
2. No menu esquerdo, clique em **SQL Editor**.
3. Clique em **New query**.
4. Abra o arquivo `database/supabase.sql` deste repositório e copie todo o conteúdo.
5. Cole no SQL Editor e clique em **Run**.
6. Deve aparecer a mensagem **Success. No rows returned**. Isso é normal.

## 2. Copiar os dois dados públicos

1. Volte para a tela inicial do projeto no Supabase.
2. Clique no botão **Connect**, na parte superior.
3. No menu **App Frameworks** ou **API Keys**, copie:
   - **Project URL**;
   - **Publishable key** (`sb_publishable_...`). Em projetos antigos, use **anon public**.
4. Abra `assets/js/supabase-config.js` e substitua somente os textos entre aspas:

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

Em **Authentication > Sign In / Providers > Password security**, configure no
servidor o mínimo de 8 caracteres (o formulário também exige 8 para novas senhas).
Se o seu plano permitir, habilite a proteção contra senhas vazadas. A validação no
navegador melhora a experiência, mas a regra do Supabase é a proteção efetiva.
Habilite também **Require current password** para que a troca de senha valide a senha
atual no próprio servidor.

## 4. Testar

1. Publique os arquivos ou abra o projeto usando o Live Server do VS Code.
2. Acesse `login.html`.
3. Crie uma conta.
4. Adicione ou altere uma tarefa.
5. No Supabase, abra **Table Editor > focus_user_states**. Uma linha deve aparecer para o usuário.

O Foque em Checks continuará mantendo uma cópia no navegador e também salvará tarefas, blocos, subtarefas e a sessão do modo foco no Supabase.

## 5. Habilitar a exclusão de conta

A opção **Excluir conta** só funciona depois de executar a versão atual do arquivo `database/supabase.sql` no **SQL Editor**. O script cria `public.delete_own_account()`, que não recebe um ID e usa apenas o usuário autenticado pelo token atual.

1. Abra **SQL Editor** no projeto Supabase.
2. Copie e execute o conteúdo atual de `database/supabase.sql`.
3. Confirme que o resultado foi **Success. No rows returned**.
4. No Foque em Checks, abra o perfil, escolha **Excluir conta** e digite a frase solicitada.

Essa ação é irreversível: remove o avatar, os estados do Foque em Checks e o usuário autenticado. Use **Baixar dados** antes, caso queira guardar uma cópia.

## 6. Ativar o histórico de segurança

A versão atual de `database/supabase.sql` também cria a tabela privada
`focus_user_state_history`. Antes de cada alteração, o Supabase arquiva o estado
anterior e mantém as 30 versões mais recentes de cada usuário.

Para habilitar esse recurso em um projeto que já está funcionando:

1. Use **Baixar dados** no perfil do Foque em Checks e guarde o JSON.
2. Abra **SQL Editor** no Supabase.
3. Copie todo o conteúdo de `database/supabase.sql` e execute.
4. Confirme **Success. No rows returned**.
5. Faça uma pequena alteração em uma tarefa.
6. Confira no **Table Editor** se `focus_user_state_history` recebeu uma linha.

O script é repetível e não apaga as tarefas existentes. Não execute comandos de
`drop table`, `truncate` ou exclusões manuais para atualizar esta configuração.
