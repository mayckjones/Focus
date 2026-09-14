-- ============================================================
-- FOCUS - BANCO DE DADOS E SEGURANÇA
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.focus_user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organizer_state jsonb,
  focus_state jsonb,
  updated_at timestamptz not null default now()
);

alter table public.focus_user_states enable row level security;

-- Usuários não autenticados não acessam os dados.
revoke all on table public.focus_user_states from anon, authenticated;
grant select, insert, update, delete on table public.focus_user_states to authenticated;

-- O script pode ser executado novamente sem gerar conflito.
drop policy if exists "Usuário visualiza o próprio estado" on public.focus_user_states;
drop policy if exists "Usuário cria o próprio estado" on public.focus_user_states;
drop policy if exists "Usuário atualiza o próprio estado" on public.focus_user_states;
drop policy if exists "Usuário exclui o próprio estado" on public.focus_user_states;

create policy "Usuário visualiza o próprio estado"
on public.focus_user_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Usuário cria o próprio estado"
on public.focus_user_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Usuário atualiza o próprio estado"
on public.focus_user_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Usuário exclui o próprio estado"
on public.focus_user_states
for delete
to authenticated
using ((select auth.uid()) = user_id);
