'use client';
import { supabase } from './supabaseClient';

// papel EFETIVO de um usuario num projeto especifico: se existir uma excecao em
// project_roles pra esse (projeto, usuario), ela manda; senao vale o papel global
// (profiles.role). Isso permite alguem ser admin só num domínio (ex.: Bateria
// Piquinzada) e convidado nos outros, sem mexer no papel global de ninguém.
export async function fetchEffectiveRole(projectId, userId, globalIsAdmin) {
  if (globalIsAdmin) return 'admin'; // admin global já é admin em tudo — não precisa nem consultar
  const { data, error } = await supabase
    .from('project_roles')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return 'convidado';
  return data.role === 'admin' ? 'admin' : 'convidado';
}

// todos os projetos (ids) onde este usuario é admin por excecao — usado na tela
// de Usuários pra admins "só de projeto" saberem quais domínios podem gerenciar
export async function fetchProjectAdminIds(userId) {
  const { data, error } = await supabase
    .from('project_roles')
    .select('project_id')
    .eq('user_id', userId)
    .eq('role', 'admin');
  if (error) return [];
  return (data || []).map((r) => r.project_id);
}
