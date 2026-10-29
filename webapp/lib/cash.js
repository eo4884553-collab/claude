'use client';
import { supabase } from './supabaseClient';
import { PROJECTS } from './projects';

// saldo de caixa REAL, compartilhado entre TODOS os domínios — SEMPRE derivado de
// fetchSharedCashHistory() (abaixo), nunca recalculado por conta própria: os dois já divergiram no
// passado porque liam fontes diferentes (ex. este aqui somava direto o "valorPago" de um custo
// mesmo sem dataPagamento, e usava o venda.valorRecebido "sincronizado" da Feijoada/Bateria em vez
// da tabela mesa_reservas/contribuintesBateria ao vivo) — ler sempre do mesmo lugar garante que o
// card do Dashboard e o drill-down item a item nunca mais mostrem números diferentes
export async function fetchSharedCashBalance() {
  const hist = await fetchSharedCashHistory();
  let totalRecebidoIngressos = 0;
  let totalRecebidoPatrocinios = 0;
  let totalPagoCustos = 0;
  let totalPagoRestituicoes = 0;
  let totalRestituicoesAprovadas = 0;
  PROJECTS.forEach((p) => {
    const dom = hist.porDominio[p.id] || { receitas: [], custos: [], restituicoes: [], restituicoesAprovadas: [] };
    (dom.receitas || []).forEach((r) => {
      if (r.tipo === 'patrocinio') totalRecebidoPatrocinios += Number(r.valor) || 0;
      else totalRecebidoIngressos += Number(r.valor) || 0;
    });
    (dom.custos || []).forEach((c) => { totalPagoCustos += Number(c.valor) || 0; });
    (dom.restituicoes || []).forEach((r) => { totalPagoRestituicoes += Number(r.valor) || 0; });
    // restituição aprovada mas AINDA NÃO PAGA — não entra na conta do saldo (dinheiro ainda não
    // saiu do caixa), é só um número de controle pra saber quanto falta efetivamente pagar
    (dom.restituicoesAprovadas || []).forEach((r) => { totalRestituicoesAprovadas += Number(r.valor) || 0; });
  });
  const saldo = hist.saldoInicial + totalRecebidoIngressos + totalRecebidoPatrocinios - totalPagoCustos - totalPagoRestituicoes;
  return { saldo, saldoInicial: hist.saldoInicial, totalRecebidoIngressos, totalRecebidoPatrocinios, totalPagoCustos, totalPagoRestituicoes, totalRestituicoesAprovadas };
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
    supabase.from('reimbursements').select('project_id,descricao,valor,user_email,paid_at,data_compra,status').in('status', ['pago', 'aprovado']),
    supabase.from('mesa_reservas').select('numero,reservado_por,pessoas,status,valor_pago,data_pagamento').eq('project_id', 'feijoada-bloco'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const saldoInicial = Number(cashRow?.saldo_inicial) || 0;
  const porDominio = {};
  PROJECTS.forEach((p) => { porDominio[p.id] = { receitas: [], custos: [], restituicoes: [], restituicoesAprovadas: [] }; });

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
        grupo: c.grupo || '',
        valor, data: c.dataPagamento, origem: c.origemPagamento || 'dominio',
      });
    });
    // patrocínio é pipeline por cenário, mas uma parcela já paga é dinheiro de verdade — lida
    // sempre do cenário "base", em qualquer dos 3 domínios. "tipo" marca a origem (patrocínio x
    // ingressos/mesas/contribuições) — é o que fetchSharedCashBalance usa pra separar os 2 cards
    // do Dashboard/Fluxo de Caixa sem duplicar a lógica de leitura dos dados
    (d.patrocinios?.base || []).forEach((t) => {
      (t.fechamentos || []).forEach((f) => {
        (f.parcelas || []).forEach((p) => {
          const valor = Number(p.valor) || 0;
          if (!valor || !p.dataPagamento) return;
          dom.receitas.push({ descricao: `${f.empresa || '(sem empresa)'} — ${t.cota || 'patrocínio'}`, valor, data: p.dataPagamento, tipo: 'patrocinio' });
        });
      });
    });
    if (row.id === 'bateria-piquinzada') {
      (d.contribuintesBateria || []).forEach((p) => {
        (p.parcelas || []).forEach((pc) => {
          const valor = Number(pc.valor) || 0;
          if (!valor || !pc.dataPagamento) return;
          dom.receitas.push({ descricao: `${p.nome || '(sem nome)'} — parcela`, valor, data: pc.dataPagamento, tipo: 'ingressos' });
        });
      });
    } else if (row.id === 'feijoada-bloco') {
      const lote1 = Number(d.venda?.valorRecebidoLote1) || 0;
      if (lote1) dom.receitas.push({ descricao: '1º lote (ingressos avulsos)', valor: lote1, data: null, agregado: true, tipo: 'ingressos' });
    } else {
      const valor = Number(d.venda?.valorRecebido) || 0;
      if (valor) dom.receitas.push({ descricao: 'Ingressos vendidos', valor, data: null, agregado: true, tipo: 'ingressos' });
    }
  });

  (mesaRows || []).forEach((m) => {
    const valor = Number(m.valor_pago) || 0;
    if (!valor) return;
    // mostra quem reservou E pra quem (nomes das pessoas na mesa) — sem isso não dá pra saber qual
    // Pix do extrato bate com qual mesa quando tem várias reservas parecidas
    const nomesPessoas = Array.isArray(m.pessoas) ? m.pessoas.map((p) => (p && p.nome) || p).filter(Boolean).join(', ') : '';
    const descricao = `Mesa ${m.numero} — reservado por ${m.reservado_por || '(sem nome)'}${nomesPessoas ? ` — pessoas: ${nomesPessoas}` : ''}${m.status !== 'paga' ? ' (pagamento parcial)' : ''}`;
    porDominio['feijoada-bloco'].receitas.push({ descricao, valor, data: m.data_pagamento, tipo: 'ingressos', mesaStatus: m.status, mesaNumero: m.numero });
  });

  (reimbRows || []).forEach((r) => {
    const dom = porDominio[r.project_id];
    if (!dom) return;
    const valor = Number(r.valor) || 0;
    if (r.status === 'pago') {
      dom.restituicoes.push({ descricao: r.descricao, quem: r.user_email, valor, data: r.paid_at ? r.paid_at.slice(0, 10) : null });
    } else if (r.status === 'aprovado') {
      // ainda não foi paga — fica de controle pra saber o que falta pagar (ver nota em
      // fetchSharedCashBalance acima: este valor não entra na conta do saldo)
      dom.restituicoesAprovadas.push({ descricao: r.descricao, quem: r.user_email, valor, data: r.data_compra || null });
    }
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
