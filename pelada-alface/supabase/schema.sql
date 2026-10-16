-- Pelada Amigos do Alface — schema do Supabase
-- Rode este arquivo inteiro no Supabase em SQL Editor > New query > Run.
-- Pode rodar de novo com segurança (usa "if not exists" / "or replace").
-- Depois rode o supabase/seed.sql para carregar as rodadas de 2026.

-- ============================================================
-- 1) PERFIS (um por usuário com login)
-- ============================================================
-- role: 'admin' lança/edita partidas; 'convidado' só visualiza.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'convidado' check (role in ('admin','convidado')),
  player_id uuid,
  -- o dono é o único que promove/rebaixa administradores (ver admin_update_profile)
  dono boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists dono boolean not null default false;
-- todo cadastro novo fica 'pendente' até o dono aprovar; só 'aprovado' enxerga os dados.
-- (a coluna nasce 'aprovado' para quem já tinha conta; o padrão dos novos vira 'pendente')
alter table public.profiles add column if not exists status text not null default 'aprovado'
  check (status in ('pendente','aprovado','recusado'));
alter table public.profiles alter column status set default 'pendente';

alter table public.profiles enable row level security;


-- ============================================================
-- 2) JOGADORES, PARTIDAS E SÚMULA
-- ============================================================
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  goleiro boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists players_nome_key on public.players (upper(nome));

do $$ begin
  alter table public.profiles
    add constraint profiles_player_fk foreign key (player_id) references public.players(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  -- gols sem autor (gol contra / não anotado) que contam para o placar de cada time
  gols_extra_branco int not null default 0 check (gols_extra_branco >= 0),
  gols_extra_verde int not null default 0 check (gols_extra_verde >= 0),
  observacoes text,
  foto_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  time text not null check (time in ('branco','verde')),
  goleiro boolean not null default false,
  gols int not null default 0 check (gols >= 0),
  amarelos int not null default 0 check (amarelos >= 0),
  vermelhos int not null default 0 check (vermelhos >= 0),
  unique (match_id, player_id, time) -- o mesmo atleta pode jogar pelos dois times (coringa), como na planilha
);
create index if not exists match_players_player_idx on public.match_players (player_id);

create table if not exists public.settings (
  id text primary key default 'main',
  -- % mínimo das rodadas da temporada que o atleta precisa ter jogado para
  -- disputar o ranking de aproveitamento (evita 1 jogo / 100% liderar)
  min_jogos_pct numeric not null default 0.4 check (min_jogos_pct between 0 and 1)
);
insert into public.settings (id) values ('main') on conflict (id) do nothing;

-- ============================================================
-- 3) QUEM É ADMIN
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'aprovado');
$$;

create or replace function public.is_aprovado()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'aprovado');
$$;

-- ============================================================
-- 4) PERMISSÕES (RLS): só usuário aprovado lê, só admin escreve
-- ============================================================
-- cada um vê o próprio perfil; admin vê todos (tela Usuários)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','matches','match_players','settings'] loop
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (public.is_aprovado())', t, t);
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ============================================================
-- 5) NOVO CADASTRO -> perfil 'convidado' pendente (aguarda o dono aprovar)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), 'convidado', 'pendente')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6) FUNÇÕES DO APP
-- ============================================================
-- só o DONO do app promove/rebaixa administradores; qualquer admin pode
-- vincular um usuário ao atleta correspondente
create or replace function public.admin_update_profile(target_id uuid, new_role text, new_player_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  atual public.profiles;
begin
  if not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  if new_role not in ('admin','convidado') then raise exception 'Papel inválido'; end if;
  select * into atual from public.profiles where id = target_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if new_role <> atual.role then
    if not exists (select 1 from public.profiles where id = auth.uid() and dono) then
      raise exception 'Só o dono do app pode mudar quem é administrador.';
    end if;
    if atual.dono then raise exception 'O dono do app continua sempre administrador.'; end if;
  end if;
  update public.profiles set role = new_role, player_id = new_player_id where id = target_id;
end;
$$;

-- só o DONO aprova ou recusa cadastros (quem não for aprovado não vê nada)
create or replace function public.dono_definir_status(target_id uuid, novo_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and dono) then
    raise exception 'Só o dono do app aprova cadastros.';
  end if;
  if novo_status not in ('pendente','aprovado','recusado') then raise exception 'Status inválido'; end if;
  if exists (select 1 from public.profiles where id = target_id and dono) then
    raise exception 'O dono do app continua sempre aprovado.';
  end if;
  -- recusar também tira o acesso de administrador
  update public.profiles
    set status = novo_status, role = case when novo_status = 'aprovado' then role else 'convidado' end
    where id = target_id;
end;
$$;

-- qualquer usuário logado diz "esse jogador sou eu" (destaca a linha dele no ranking)
create or replace function public.set_my_player(new_player_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  update public.profiles set player_id = new_player_id where id = auth.uid();
end;
$$;

-- grava a súmula inteira de uma rodada de uma vez (cria jogadores novos pelo nome).
-- p_players: [{"nome","time","goleiro","gols","amarelos","vermelhos"}, ...]
create or replace function public._save_match(
  p_match_id uuid, p_data date, p_extra_branco int, p_extra_verde int,
  p_obs text, p_foto text, p_players jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  mid uuid := p_match_id;
  item jsonb;
  pid uuid;
  pnome text;
begin
  if mid is null then
    insert into public.matches (data, gols_extra_branco, gols_extra_verde, observacoes, foto_path, updated_by)
    values (p_data, coalesce(p_extra_branco,0), coalesce(p_extra_verde,0), p_obs, p_foto, auth.uid())
    returning id into mid;
  else
    update public.matches
      set data = p_data, gols_extra_branco = coalesce(p_extra_branco,0), gols_extra_verde = coalesce(p_extra_verde,0),
          observacoes = p_obs, foto_path = coalesce(p_foto, foto_path), updated_at = now(), updated_by = auth.uid()
      where id = mid;
    if not found then raise exception 'Partida não encontrada.'; end if;
    delete from public.match_players where match_id = mid;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    pnome := upper(btrim(regexp_replace(item->>'nome', '\s+', ' ', 'g')));
    if pnome is null or pnome = '' then continue; end if;
    select id into pid from public.players where upper(nome) = pnome;
    if pid is null then
      insert into public.players (nome, goleiro) values (pnome, coalesce((item->>'goleiro')::boolean, false))
      returning id into pid;
    end if;
    insert into public.match_players (match_id, player_id, time, goleiro, gols, amarelos, vermelhos)
    values (mid, pid, item->>'time', coalesce((item->>'goleiro')::boolean, false),
            coalesce((item->>'gols')::int, 0), coalesce((item->>'amarelos')::int, 0), coalesce((item->>'vermelhos')::int, 0))
    on conflict (match_id, player_id, time) do update
      set gols = public.match_players.gols + excluded.gols,
          amarelos = public.match_players.amarelos + excluded.amarelos,
          vermelhos = public.match_players.vermelhos + excluded.vermelhos;
  end loop;
  return mid;
end;
$$;
revoke all on function public._save_match(uuid, date, int, int, text, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_save_match(
  p_match_id uuid, p_data date, p_extra_branco int, p_extra_verde int,
  p_obs text, p_foto text, p_players jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem lançar partidas.'; end if;
  if exists (select 1 from public.matches where data = p_data and id is distinct from p_match_id) then
    raise exception 'Já existe uma partida lançada em %. Edite a existente na aba Partidas.', to_char(p_data, 'DD/MM/YYYY');
  end if;
  return public._save_match(p_match_id, p_data, p_extra_branco, p_extra_verde, p_obs, p_foto, p_players);
end;
$$;

-- ============================================================
-- 7) FOTOS DAS SÚMULAS (Storage)
-- ============================================================
insert into storage.buckets (id, name, public) values ('sumulas', 'sumulas', true)
  on conflict (id) do nothing;

drop policy if exists "sumulas_admin_insert" on storage.objects;
create policy "sumulas_admin_insert" on storage.objects
  for insert with check (bucket_id = 'sumulas' and public.is_admin());
drop policy if exists "sumulas_admin_delete" on storage.objects;
create policy "sumulas_admin_delete" on storage.objects
  for delete using (bucket_id = 'sumulas' and public.is_admin());

-- ============================================================
-- 8) PRIMEIRO ADMIN
-- ============================================================
-- Todo cadastro novo entra como 'convidado'. Depois de criar SUA conta pelo app,
-- rode isto uma única vez (troque o e-mail) — dali em diante você promove os
-- outros administradores direto pela tela "Usuários" do app:
--
--   update public.profiles set role = 'admin', dono = true, status = 'aprovado' where email = 'seu-email@exemplo.com';
--
-- O "dono" é o único que promove/rebaixa administradores pela tela Usuários.
