'use client';
import { supabase } from './supabaseClient';
import { PROJECTS } from './projects';
import { paidReimbursementsTotalAllProjects } from './reimbursements';

// saldo de caixa REAL, compartilhado entre TODOS os domínios — soma tudo que já foi de fato
// pago (custos pagos + restituições pagas, em qualquer domínio) e tudo que já entrou de verdade
// (ingressos recebidos, em qualquer domínio), a partir de um único saldo inicial da organização
export async function fetchSharedCashBalance() {
  const [{ data: cashRow, error: e1 }, { data: states, error: e2 }, totalPagoRestituicoes] = await Promise.all([
    supabase.from('org_cash').select('saldo_inicial').eq('id', 'main').maybeSingle(),
    supabase.from('project_state').select('id,data').in('id', PROJECTS.map((p) => p.id)),
    paidReimbursementsTotalAllProjects(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const saldoInicial = Number(cashRow?.saldo_inicial) || 0;
  let totalPagoCustos = 0;
  let totalRecebidoIngressos = 0;
  (states || []).forEach((row) => {
    const d = row.data || {};
    (d.custos || []).forEach((c) => { totalPagoCustos += Number(c.valorPago) || 0; });
    totalRecebidoIngressos += Number(d.venda?.valorRecebido) || 0;
  });
  const saldo = saldoInicial + totalRecebidoIngressos - totalPagoCustos - totalPagoRestituicoes;
  return { saldo, saldoInicial, totalRecebidoIngressos, totalPagoCustos, totalPagoRestituicoes };
}

export async function setSharedCashSaldoInicial(valor, userId) {
  const { error } = await supabase
    .from('org_cash')
    .update({ saldo_inicial: valor, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', 'main');
  if (error) throw error;
}
