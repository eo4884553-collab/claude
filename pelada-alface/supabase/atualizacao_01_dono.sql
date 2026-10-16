-- Atualização 01: só o DONO do app promove/rebaixa administradores.
-- Para quem já rodou o schema.sql antes desta mudança. Rode uma vez no
-- SQL Editor do Supabase (pode rodar de novo sem problema).

alter table public.profiles add column if not exists dono boolean not null default false;

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

-- o primeiro administrador cadastrado vira o dono (se ainda não houver dono)
update public.profiles set dono = true
where id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
  and not exists (select 1 from public.profiles where dono);

select email, role, dono from public.profiles where role = 'admin';
