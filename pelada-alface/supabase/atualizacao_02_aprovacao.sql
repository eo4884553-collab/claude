-- Atualização 02: cadastros novos precisam ser APROVADOS pelo dono para ver o app.
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Quem já tem conta continua liberado; o modo "convidado sem conta" deixa de existir.

-- todo cadastro novo fica 'pendente' até o dono aprovar; só 'aprovado' enxerga os dados.
-- (a coluna nasce 'aprovado' para quem já tinha conta; o padrão dos novos vira 'pendente')
alter table public.profiles add column if not exists status text not null default 'aprovado'
  check (status in ('pendente','aprovado','recusado'));
alter table public.profiles alter column status set default 'pendente';

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


-- leitura dos dados só para aprovados
do $$
declare t text;
begin
  foreach t in array array['players','matches','match_players','settings'] loop
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (public.is_aprovado())', t, t);
  end loop;
end $$;

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

update public.profiles set status = 'aprovado' where dono;

select email, role, dono, status from public.profiles order by created_at;
