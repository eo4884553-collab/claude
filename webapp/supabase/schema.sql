-- Piquinzada PMO — schema do Supabase
-- Rode este arquivo inteiro no painel do Supabase em SQL Editor > New query > Run.
-- Pode rodar de novo com seguranca (usa "if not exists" / "or replace" onde da).

-- ============================================================
-- 1) PERFIS (um por usuario autenticado)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'convidado' check (role in ('admin','convidado')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- qualquer usuario logado pode ver a lista de perfis (precisa pra tela de admin
-- funcionar, e pra qualquer um ver quem mais tem acesso). Nao expõe senha nem
-- nada sensivel — so email/role/status.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

-- ninguem atualiza profiles direto pelo cliente — aprovar/rejeitar/trocar papel
-- passa SEMPRE pela funcao admin_update_profile() abaixo, que confere que quem
-- esta chamando e admin antes de aplicar. Sem policy de update = update bloqueado.

-- ============================================================
-- 2) ESTADO DO PROJETO (uma linha só — os dados do app, iguais ao "state" do front)
-- ============================================================
create table if not exists public.project_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.project_state (id, data)
  values ('main', '{}'::jsonb)
  on conflict (id) do nothing;

alter table public.project_state enable row level security;

-- le quem estiver aprovado (admin OU convidado)
drop policy if exists "project_state_select_approved" on public.project_state;
create policy "project_state_select_approved" on public.project_state
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'approved'
    )
  );

-- so admin aprovado grava
drop policy if exists "project_state_update_admin" on public.project_state;
create policy "project_state_update_admin" on public.project_state
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'approved' and p.role = 'admin'
    )
  );

-- ============================================================
-- 3) NOVO CADASTRO -> cria perfil pendente automaticamente
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'convidado', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 4) ACOES DE ADMIN (aprovar/rejeitar/trocar papel) — via funcao, nao via UPDATE direto
-- ============================================================
create or replace function public.admin_update_profile(
  target_id uuid,
  new_status text,
  new_role text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  ) then
    raise exception 'Apenas administradores aprovados podem alterar usuários.';
  end if;

  if new_status not in ('pending','approved','rejected') then
    raise exception 'status inválido';
  end if;
  if new_role not in ('admin','convidado') then
    raise exception 'role inválido';
  end if;

  update public.profiles
    set status = new_status, role = new_role
    where id = target_id;
end;
$$;

-- ============================================================
-- 5) BOOTSTRAP DO PRIMEIRO ADMIN
-- ============================================================
-- Nao existe admin nenhum logo apos rodar este schema — o 1º usuario que se
-- cadastrar no app tambem cai como 'convidado'/'pending' (ninguem pra aprovar
-- ele ainda). Depois de cadastrar o PRIMEIRO usuario (o dono do projeto) pelo
-- app, rode isto AQUI no SQL Editor, trocando o e-mail:
--
--   update public.profiles
--     set role = 'admin', status = 'approved'
--     where email = 'seu-email@exemplo.com';
--
-- Depois disso, esse usuario ja consegue aprovar todo mundo direto pela tela
-- "Usuários" do app — nao precisa mais mexer no SQL Editor.

-- ============================================================
-- 6) OUTROS PROJETOS/EVENTOS (mesma estrutura, dados separados)
-- ============================================================
-- Cada linha aqui é um "board" separado dentro do mesmo app (aparece no
-- seletor do topo, ao lado do nome do evento). As politicas de RLS acima ja
-- valem pra qualquer id (nao precisa mexer nelas). Depois de rodar o INSERT
-- abaixo, adicione o mesmo id em webapp/lib/projects.js e publique de novo.
insert into public.project_state (id, data)
  values ('feijoada-bloco', '{}'::jsonb)
  on conflict (id) do nothing;

insert into public.project_state (id, data)
  values ('bateria-piquinzada', '{}'::jsonb)
  on conflict (id) do nothing;

-- ============================================================
-- 7) RESTITUIÇÃO DE CAIXA (compras do próprio bolso, com comprovante)
-- ============================================================
-- Qualquer usuário aprovado (admin OU convidado) pode lançar uma compra que fez do
-- próprio bolso e anexar o comprovante. Todo mundo aprovado pode VER os lançamentos
-- (transparência), mas só administrador aprova/rejeita — sempre pela função
-- admin_review_reimbursement() abaixo, nunca por UPDATE direto do cliente.
create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.project_state(id),
  user_id uuid not null references auth.users(id),
  user_email text not null,
  descricao text not null,
  valor numeric not null check (valor > 0),
  data_compra date,
  comprovante_path text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  obs_admin text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

alter table public.reimbursements enable row level security;

drop policy if exists "reimb_select_approved" on public.reimbursements;
create policy "reimb_select_approved" on public.reimbursements
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );

-- qualquer aprovado cria SEU PRÓPRIO lançamento, sempre começando como 'pendente'
-- (o valor de status que o cliente mandar é ignorado por causa do "with check" abaixo)
drop policy if exists "reimb_insert_approved" on public.reimbursements;
create policy "reimb_insert_approved" on public.reimbursements
  for insert with check (
    user_id = auth.uid() and status = 'pendente'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );

-- o próprio autor pode excluir enquanto está pendente (corrigir engano); admin pode excluir qualquer um
drop policy if exists "reimb_delete_owner_pending_or_admin" on public.reimbursements;
create policy "reimb_delete_owner_pending_or_admin" on public.reimbursements
  for delete using (
    (user_id = auth.uid() and status = 'pendente')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role = 'admin')
  );

-- sem policy de UPDATE — aprovar/rejeitar é sempre por esta função, que confere admin no servidor
create or replace function public.admin_review_reimbursement(
  target_id uuid,
  new_status text,
  admin_obs text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  ) then
    raise exception 'Apenas administradores aprovados podem revisar restituições.';
  end if;

  if new_status not in ('pendente','aprovado','rejeitado') then
    raise exception 'status inválido';
  end if;

  update public.reimbursements
    set status = new_status, obs_admin = admin_obs, reviewed_by = auth.uid(), reviewed_at = now()
    where id = target_id;
end;
$$;

-- bucket de armazenamento dos comprovantes (imagem ou PDF) — privado, só quem está
-- logado e aprovado no app consegue subir/ver arquivos dele
insert into storage.buckets (id, name, public)
  values ('comprovantes', 'comprovantes', false)
  on conflict (id) do nothing;

drop policy if exists "comprovantes_insert_approved" on storage.objects;
create policy "comprovantes_insert_approved" on storage.objects
  for insert with check (
    bucket_id = 'comprovantes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );

drop policy if exists "comprovantes_select_approved" on storage.objects;
create policy "comprovantes_select_approved" on storage.objects
  for select using (
    bucket_id = 'comprovantes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );
