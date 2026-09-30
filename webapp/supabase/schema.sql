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

-- ============================================================
-- 8) ADMINISTRADOR POR PROJETO (admin só num domínio, convidado nos outros)
-- ============================================================
-- Por padrão o papel GLOBAL (profiles.role) vale em todos os projetos. Esta
-- tabela guarda EXCEÇÕES por projeto: se existir uma linha aqui pra
-- (projeto, usuário), ela manda SÓ NAQUELE projeto, por cima do papel global —
-- sem mudar o papel do usuário nos outros projetos.
create table if not exists public.project_roles (
  project_id text not null references public.project_state(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin','convidado')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (project_id, user_id)
);

alter table public.project_roles enable row level security;

-- qualquer aprovado le (precisa pra calcular o proprio papel efetivo em cada projeto)
drop policy if exists "project_roles_select_approved" on public.project_roles;
create policy "project_roles_select_approved" on public.project_roles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );

-- sem policy de insert/update/delete direto — sempre pelas funcoes abaixo

-- papel EFETIVO de um usuario num projeto: exceção em project_roles manda; senão
-- vale o papel global (profiles.role). Usada pelas policies e pelo app (client).
create or replace function public.effective_role(target_project text, target_user uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select pr.role from public.project_roles pr where pr.project_id = target_project and pr.user_id = target_user),
    (select p.role from public.profiles p where p.id = target_user)
  );
$$;

-- so quem ja e admin (global OU so daquele projeto) pode criar/trocar uma excecao
create or replace function public.admin_set_project_role(
  target_project text,
  target_user uuid,
  new_role text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
     or public.effective_role(target_project, auth.uid()) is distinct from 'admin' then
    raise exception 'Apenas administradores (globais ou deste projeto) podem alterar papéis.';
  end if;

  if new_role not in ('admin','convidado') then
    raise exception 'papel inválido';
  end if;

  insert into public.project_roles (project_id, user_id, role, updated_by)
    values (target_project, target_user, new_role, auth.uid())
  on conflict (project_id, user_id) do update
    set role = excluded.role, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- remove a excecao (o usuario volta a usar o papel global nesse projeto)
create or replace function public.admin_clear_project_role(
  target_project text,
  target_user uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
     or public.effective_role(target_project, auth.uid()) is distinct from 'admin' then
    raise exception 'Apenas administradores (globais ou deste projeto) podem alterar papéis.';
  end if;

  delete from public.project_roles where project_id = target_project and user_id = target_user;
end;
$$;

-- a partir daqui, "e admin" pra gravar em project_state e revisar restituicoes
-- passa a considerar o papel POR PROJETO (com fallback pro papel global)

drop policy if exists "project_state_update_admin" on public.project_state;
create policy "project_state_update_admin" on public.project_state
  for update using (
    public.effective_role(id, auth.uid()) = 'admin'
  );

drop policy if exists "reimb_delete_owner_pending_or_admin" on public.reimbursements;
create policy "reimb_delete_owner_pending_or_admin" on public.reimbursements
  for delete using (
    (user_id = auth.uid() and status = 'pendente')
    or public.effective_role(project_id, auth.uid()) = 'admin'
  );

create or replace function public.admin_review_reimbursement(
  target_id uuid,
  new_status text,
  admin_obs text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  target_project text;
begin
  select project_id into target_project from public.reimbursements where id = target_id;

  if target_project is null or public.effective_role(target_project, auth.uid()) is distinct from 'admin' then
    raise exception 'Apenas administradores (globais ou deste projeto) podem revisar restituições.';
  end if;

  if new_status not in ('pendente','aprovado','rejeitado') then
    raise exception 'status inválido';
  end if;

  update public.reimbursements
    set status = new_status, obs_admin = admin_obs, reviewed_by = auth.uid(), reviewed_at = now()
    where id = target_id;
end;
$$;

-- ============================================================
-- 9) RESTITUIÇÃO DE CAIXA — status "pago" (dinheiro devolvido de verdade)
-- ============================================================
-- "Aprovado" só reconhece o gasto como legítimo (já entra no custo do evento). "Pago" é quando o
-- dinheiro de fato sai do caixa e volta pra pessoa — é ESSE status que deduz do saldo de caixa
-- compartilhado entre os domínios (seção 10). Guarda também o comprovante do PAGAMENTO em si
-- (ex.: print do PIX), separado do comprovante da COMPRA que a pessoa já anexou ao lançar.
alter table public.reimbursements
  add column if not exists pagamento_comprovante_path text,
  add column if not exists paid_by uuid references auth.users(id),
  add column if not exists paid_at timestamptz;

alter table public.reimbursements drop constraint if exists reimbursements_status_check;
alter table public.reimbursements add constraint reimbursements_status_check
  check (status in ('pendente','aprovado','rejeitado','pago'));

-- a versão antiga (3 parâmetros) precisa ser removida explicitamente — "create or replace"
-- NÃO substitui uma função com assinatura diferente, ele cria uma segunda função por cima.
-- Com as duas no banco, uma chamada com só 3 argumentos fica ambígua (o Postgres não sabe
-- se é a antiga ou a nova com o 4º parâmetro no padrão), e toda aprovação passa a falhar com
-- "Could not choose the best candidate function".
drop function if exists public.admin_review_reimbursement(uuid, text, text);

create or replace function public.admin_review_reimbursement(
  target_id uuid,
  new_status text,
  admin_obs text default null,
  pagamento_comprovante_path text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  target_project text;
begin
  select project_id into target_project from public.reimbursements where id = target_id;

  if target_project is null or public.effective_role(target_project, auth.uid()) is distinct from 'admin' then
    raise exception 'Apenas administradores (globais ou deste projeto) podem revisar restituições.';
  end if;

  if new_status not in ('pendente','aprovado','rejeitado','pago') then
    raise exception 'status inválido';
  end if;
  if new_status = 'pago' and pagamento_comprovante_path is null then
    raise exception 'Anexe o comprovante do pagamento antes de marcar como pago.';
  end if;

  update public.reimbursements r
    set status = new_status, obs_admin = admin_obs, reviewed_by = auth.uid(), reviewed_at = now(),
        pagamento_comprovante_path = coalesce(admin_review_reimbursement.pagamento_comprovante_path, r.pagamento_comprovante_path),
        paid_by = case when new_status='pago' then auth.uid() else r.paid_by end,
        paid_at = case when new_status='pago' then now() else r.paid_at end
    where r.id = target_id;
end;
$$;

-- ============================================================
-- 10) SALDO DE CAIXA COMPARTILHADO (um caixa físico só, entre TODOS os domínios)
-- ============================================================
-- Guarda só o saldo INICIAL (um número da organização inteira, não de 1 evento). O saldo atual é
-- calculado ao vivo pelo app (PmoFrame): saldo inicial + tudo que já foi RECEBIDO de venda de
-- ingressos (em qualquer domínio) − tudo que já foi PAGO em Custos (em qualquer domínio) − tudo
-- que já foi PAGO em restituições de caixa (em qualquer domínio). O mesmo número aparece em
-- todos os 3 domínios.
create table if not exists public.org_cash (
  id text primary key default 'main',
  saldo_inicial numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.org_cash (id) values ('main') on conflict (id) do nothing;

alter table public.org_cash enable row level security;

drop policy if exists "org_cash_select_approved" on public.org_cash;
create policy "org_cash_select_approved" on public.org_cash
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );

-- só administrador GLOBAL altera o saldo inicial — é um número da organização inteira, não
-- de um projeto só, então não usa o papel por projeto (effective_role) aqui de propósito
drop policy if exists "org_cash_update_global_admin" on public.org_cash;
create policy "org_cash_update_global_admin" on public.org_cash
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role = 'admin')
  );
