/*
  # Criação da tabela de perfis de usuário

  1. Novas Tabelas
    - `profiles`
      - `id` (uuid, chave primária, referência a auth.users)
      - `email` (text)
      - `role` (text: 'admin', 'operator', 'viewer')
      - `created_at` (timestamp)
  2. Segurança
    - Habilita RLS na tabela `profiles`
    - Adiciona políticas de leitura e escrita
  3. Automação
    - Trigger para criar perfil automaticamente ao registrar novo usuário
*/

-- Cria a tabela
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text check (role in ('admin', 'operator', 'viewer')) default 'viewer',
  created_at timestamptz default now()
);

-- Habilita segurança
alter table public.profiles enable row level security;

-- Políticas de acesso
create policy "Perfis visíveis para todos autenticados"
  on public.profiles for select
  to authenticated
  using ( true );

create policy "Apenas usuários autenticados podem editar"
  on public.profiles for update
  to authenticated
  using ( true );

-- Função para criar perfil automaticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger que dispara após criação de usuário no Auth
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: Cria perfis para usuários que JÁ existem (define como admin para garantir acesso inicial)
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
on conflict (id) do nothing;