# Renomear para Foque em Checks

## O que já foi alterado

As páginas, títulos, relatório visual, exportação JSON e documentação usam a marca **Foque em Checks**.

## O que deve permanecer igual

Não renomeie diretamente os identificadores abaixo: eles são chaves de compatibilidade com os dados já salvos.

- tabela `public.focus_user_states` e histórico `public.focus_user_state_history`;
- bucket `focus-avatars`;
- chaves locais `focusOrganizerState` e `focusAppState`;
- URL do projeto Supabase (`bfkgeptjxjkdxchvypoh.supabase.co`).

Alterar esses nomes sem uma migração com leitura dos nomes antigos pode fazer a aplicação parecer sem dados.

## Renomear o repositório no GitHub

1. Abra o repositório no GitHub e entre em **Settings → General**.
2. Em **Repository name**, informe `foqueemchecks` e confirme **Rename**.
3. No GitHub Desktop, abra **Repository → Repository settings → Remote**.
4. Troque o remoto para `https://github.com/mayckjones/foqueemchecks.git` e salve.
5. Faça **Fetch origin** e confirme que o branch `main` continua apontando para o repositório correto.

O GitHub mantém redirecionamentos do endereço antigo, mas atualizar o remoto local evita depender deles.

## Renomear a pasta local

Feche o VS Code e o GitHub Desktop. No Explorador do Windows, renomeie a pasta `Focus` para `Foque-em-Checks`. Depois abra novamente a pasta renomeada no VS Code e no GitHub Desktop.

## Supabase e links publicados

Você pode alterar o nome de exibição do projeto no painel do Supabase, mas mantenha a URL/API atuais no código. Se o endereço do GitHub Pages mudar, atualize também **Authentication → URL Configuration** no Supabase, incluindo a URL principal e os redirect URLs.
