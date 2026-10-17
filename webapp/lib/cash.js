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

// histórico completo por trás do saldo de caixa compartilhado — item por item, agrupado por
// domínio, pra dar pra conferir exatamente o que compõe o número (ver fetchSharedCashBalance
// acima, que só soma totais). Receita de ingressos (Piquinzada 2027 e o "1º lote" da Feijoada)
// não tem lançamento individual no app — são sempre um número agregado só, então entram como
// 1 linha marcada "agregado: true"; o resto (custos em qualquer domínio, contribuições da
// Bateria por pessoa/parcela, mesas pagas da Feijoada, restituições pagas) é sempre item a item.
export async function fetchSharedCashHistory() {
  const [{ data: cashRow, error: e1 }, { data: states, error: e2 }, { data: reimbRows, error: e3 }, { data: mesaRows, error: e4 }] = await Promise.all([
    supabase.from('org_cash').select('saldo_inicial').eq('id', 'main').maybeSingle(),
    supabase.from('project_state').select('id,data').in('id', PROJECTS.map((p) => p.id)),
    supabase.from('reimbursements').select('project_id,descricao,valor,user_email,paid_at').eq('status', 'pago'),
    supabase.from('mesa_reservas').select('numero,reservado_por,status,valor_pago,data_pagamento').eq('project_id', 'feijoada-bloco'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const saldoInicial = Number(cashRow?.saldo_inicial) || 0;
  const porDominio = {};
  PROJECTS.forEach((p) => { porDominio[p.id] = { receitas: [], custos: [], restituicoes: [] }; });

  (states || []).forEach((row) => {
    const d = row.data || {};
    const dom = porDominio[row.id];
    if (!dom) return;
    (d.custos || []).forEach((c) => {
      const valor = Number(c.valorPago) || 0;
      if (!valor || !c.dataPagamento) return;
      dom.custos.push({
        fornecedor: c.fornecedor || '(sem fornecedor)',
        subcategoria: c.subcategoria || c.grupo || '',
        valor, data: c.dataPagamento, origem: c.origemPagamento || 'dominio',
      });
    });
    if (row.id === 'bateria-piquinzada') {
      (d.contribuintesBateria || []).forEach((p) => {
        (p.parcelas || []).forEach((pc) => {
          const valor = Number(pc.valor) || 0;
          if (!valor || !pc.dataPagamento) return;
          dom.receitas.push({ descricao: `${p.nome || '(sem nome)'} — parcela`, valor, data: pc.dataPagamento });
        });
      });
    } else if (row.id === 'feijoada-bloco') {
      const lote1 = Number(d.venda?.valorRecebidoLote1) || 0;
      if (lote1) dom.receitas.push({ descricao: '1º lote (ingressos avulsos)', valor: lote1, data: null, agregado: true });
    } else {
      const valor = Number(d.venda?.valorRecebido) || 0;
      if (valor) dom.receitas.push({ descricao: 'Ingressos vendidos', valor, data: null, agregado: true });
    }
  });

  (mesaRows || []).forEach((m) => {
    const valor = Number(m.valor_pago) || 0;
    const paga = m.status === 'paga' || !!m.data_pagamento || valor > 0;
    if (!paga || !valor) return;
    porDominio['feijoada-bloco'].receitas.push({ descricao: `Mesa ${m.numero} — ${m.reservado_por || '(sem nome)'}`, valor, data: m.data_pagamento });
  });

  (reimbRows || []).forEach((r) => {
    const dom = porDominio[r.project_id];
    if (!dom) return;
    dom.restituicoes.push({ descricao: r.descricao, quem: r.user_email, valor: Number(r.valor) || 0, data: r.paid_at ? r.paid_at.slice(0, 10) : null });
  });

  return { saldoInicial, porDominio };
}

export async function setSharedCashSaldoInicial(valor, userId) {
  const { error } = await supabase
    .from('org_cash')
    .update({ saldo_inicial: valor, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', 'main');
  if (error) throw error;
}
