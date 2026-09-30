'use client';
import { supabase } from './supabaseClient';

// soma dos lançamentos de restituição de caixa já aprovados OU pagos de um projeto — este
// valor entra como custo real nas avaliações financeiras daquele evento (ver
// pmo-app-template.html: state.restituicoesAprovadas, injetado pelo PmoFrame). "Aprovado" já
// reconhece o custo mesmo antes do dinheiro sair de fato (ver paidReimbursementsTotal abaixo,
// que é o que deduz do saldo de caixa).
export async function approvedReimbursementsTotal(projectId) {
  const { data, error } = await supabase
    .from('reimbursements')
    .select('valor')
    .eq('project_id', projectId)
    .in('status', ['aprovado', 'pago']);
  if (error) throw error;
  return (data || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
}

// soma de tudo que já foi de fato PAGO (dinheiro saiu do caixa), em TODOS os projetos — usado
// pelo saldo de caixa compartilhado (ver lib/cash.js)
export async function paidReimbursementsTotalAllProjects() {
  const { data, error } = await supabase.from('reimbursements').select('valor').eq('status', 'pago');
  if (error) throw error;
  return (data || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
}
