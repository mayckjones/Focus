# Segurança, backup e recuperação

## Proteções existentes

- Cada usuário acessa somente sua linha por políticas RLS.
- A chave usada no navegador é pública; chaves secretas não pertencem ao frontend.
- O estado local é separado pelo ID do usuário.
- Cinco versões anteriores ficam no navegador e são incluídas em **Baixar dados**.
- A sincronização verifica `updated_at`; se outra aba gravou primeiro, a cópia local
  é preservada e a gravação conflitante é recusada.
- O SQL atual mantém 30 versões anteriores em `focus_user_state_history`.
- O bucket de avatares é privado e cada conta acessa somente sua própria pasta.

## Rotina recomendada

1. Baixe o JSON pelo perfil antes de uma atualização grande.
2. Faça alterações de banco primeiro em um projeto de teste.
3. Não altere RLS, triggers ou a estrutura da linha de estado sem testar duas contas.
4. Guarde exportações fora do navegador; `localStorage` é apagado se os dados do site
   forem limpos.
5. Se o projeto estiver em um plano com backups, confira periodicamente se eles estão
   sendo gerados. Objetos do Storage exigem cópia separada.

## Consultar versões no SQL Editor

O SQL Editor tem privilégios administrativos. Primeiro localize o usuário correto
pelo e-mail; não escolha apenas pela posição da linha.

```sql
select
  h.id,
  u.email,
  h.archived_at,
  h.source_updated_at,
  h.organizer_state,
  h.focus_state
from public.focus_user_state_history h
join auth.users u on u.id = h.user_id
where u.email = 'SEU_EMAIL_AQUI'
order by h.archived_at desc;
```

Antes de restaurar, exporte o estado atual. Depois substitua `ID_DO_HISTORICO` e
`SEU_EMAIL_AQUI` nesta atualização:

```sql
update public.focus_user_states current_state
set
  organizer_state = history.organizer_state,
  focus_state = history.focus_state,
  updated_at = now()
from public.focus_user_state_history history
join auth.users account on account.id = history.user_id
where current_state.user_id = history.user_id
  and history.id = ID_DO_HISTORICO
  and account.email = 'SEU_EMAIL_AQUI';
```

Confirme que o resultado indica uma linha alterada. Recarregue o Foque em Checks somente
depois dessa confirmação.
