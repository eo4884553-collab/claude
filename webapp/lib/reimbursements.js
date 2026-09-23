'use client';
import { supabase } from './supabaseClient';

// soma dos lançamentos de restituição de caixa já aprovados de um projeto — este
// valor entra como custo real nas avaliações financeiras daquele evento (ver
// pmo-app-template.html: state.restituicoesAprovadas, injetado pelo PmoFrame)
export async function approvedReimbursementsTotal(projectId) {
  const { data, error } = await supabase
    .from('reimbursements')
    .select('valor')
    .eq('project_id', projectId)
    .eq('status', 'aprovado');
  if (error) throw error;
  return (data || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
}
