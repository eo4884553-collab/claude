'use strict';
/**
 * Motor de cálculo: parte de dados "crus" editáveis (avanço por categoria, itens do
 * detalhamento FC, parcelas lançadas, parâmetros) e deriva tudo que o app mostra:
 * % de execução, liberação de caixa (PCI), valor a pagar ao empreiteiro, saldo de
 * recursos e o fluxo de caixa mensal. Nada aqui é persistido — é recalculado a cada
 * leitura, então qualquer edição se propaga automaticamente para todas as abas.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

function monthKeyFromDateStr(dateStr) {
  if (!dateStr) return null;
  const d = String(dateStr).slice(0, 7); // YYYY-MM
  return /^\d{4}-\d{2}$/.test(d) ? d : null;
}

const MONTH_LABEL = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function addMonthsToKey(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function monthLabel(monthKey) {
  if (!monthKey) return 'Sem data';
  const [y, m] = monthKey.split('-');
  return `${MONTH_LABEL[m] || m}/${y}`;
}

/** Calcula os campos derivados de uma categoria (Detalhamento FC). */
function computeCategoria(cat) {
  const valorOrcado = Number(cat.valorOrcado) || 0;
  const valorRealizadoItens = round2(sum(cat.itens || [], (it) => it.valorRealizado));
  const percAvancoItens = valorOrcado > 0 ? valorRealizadoItens / valorOrcado : 0;

  const temOverride = cat.percAvancoManual !== null && cat.percAvancoManual !== undefined;
  const percAvancoEfetivo = clamp(temOverride ? Number(cat.percAvancoManual) : percAvancoItens, 0, 5);
  const valorMedido = round2(valorOrcado * percAvancoEfetivo);

  return {
    ...cat,
    valorRealizadoItens,
    percAvancoItens: round2(percAvancoItens * 10000) / 10000,
    percAvancoEfetivo: round2(percAvancoEfetivo * 10000) / 10000,
    origemPercAvanco: temOverride ? 'manual' : 'itens',
    valorMedido,
    saldoContratoCategoria: round2(valorOrcado - valorMedido),
  };
}

/** Calcula a liberação de caixa (PCI) etapa a etapa, com base no % de obra geral. */
function computeLiberacaoPCI(liberacaoPCI, percObraGeral) {
  const etapas = [...liberacaoPCI].sort((a, b) => a.etapa - b.etapa);
  let liberadoAcumuladoAnterior = 0;
  return etapas.map((etapa, idx) => {
    const valor = Number(etapa.valor) || 0;
    const limiteSuperior = Number(etapa.percLimiteAcumulado) || 0;
    const limiteInferior = idx === 0 ? 0 : Number(etapas[idx - 1].percLimiteAcumulado) || 0;

    let fracaoAuto;
    if (etapa.etapa === 1) {
      // Aquisição do lote: liberação integral assim que a obra é iniciada.
      fracaoAuto = percObraGeral > 0 ? 1 : 0;
    } else {
      const faixa = limiteSuperior - limiteInferior;
      fracaoAuto = faixa > 0 ? clamp((percObraGeral - limiteInferior) / faixa, 0, 1) : 0;
    }
    const valorLiberadoAuto = round2(valor * fracaoAuto);

    const temOverride = etapa.liberadoManual !== null && etapa.liberadoManual !== undefined;
    const valorLiberado = temOverride ? round2(Number(etapa.liberadoManual)) : valorLiberadoAuto;

    liberadoAcumuladoAnterior += valorLiberado;
    return {
      ...etapa,
      limiteInferior,
      valorLiberadoAuto,
      valorLiberado,
      origemLiberado: temOverride ? 'manual' : 'auto',
      percLiberado: valor > 0 ? round2((valorLiberado / valor) * 10000) / 10000 : 0,
    };
  });
}

function computeParcela(parcela) {
  const autoTotalATransferir = round2((Number(parcela.totalEmpreiteiroPix) || 0) + (Number(parcela.totalAdmPix) || 0));
  const autoCustoTotal = round2(autoTotalATransferir + (Number(parcela.gastoCartao) || 0) + (Number(parcela.parcelaEvolucaoCaixa) || 0));
  const overrides = parcela.overrides || {};
  return {
    ...parcela,
    totalATransferir: overrides.totalATransferir ? Number(parcela.totalATransferir) : autoTotalATransferir,
    custoTotal: overrides.custoTotal ? Number(parcela.custoTotal) : autoCustoTotal,
    autoTotalATransferir,
    autoCustoTotal,
  };
}

function recompute(state) {
  const categorias = (state.categorias || []).map(computeCategoria);
  const totalOrcadoCategorias = round2(sum(categorias, (c) => c.valorOrcado));
  const totalMedido = round2(sum(categorias, (c) => c.valorMedido));
  const percObraGeral = totalOrcadoCategorias > 0 ? totalMedido / totalOrcadoCategorias : 0;

  const liberacaoPCI = computeLiberacaoPCI(state.liberacaoPCI || [], percObraGeral);
  const caixaLiberadaAcumulada = round2(sum(liberacaoPCI, (e) => e.valorLiberado));
  const creditoCaixaTotalPCI = round2(sum(liberacaoPCI, (e) => e.valor));

  const parcelas = (state.parcelas || [])
    .map(computeParcela)
    .sort((a, b) => {
      const da = a.vencimento || a.vencPlanejado || '';
      const db_ = b.vencimento || b.vencPlanejado || '';
      return da.localeCompare(db_);
    });

  const parcelasRealizadas = parcelas.filter((p) => p.status === 'REALIZADO');
  const totalEmpreiteiroPago = round2(sum(parcelasRealizadas, (p) => p.totalEmpreiteiroPix));
  const totalAdmPago = round2(sum(parcelasRealizadas, (p) => p.totalAdmPix));
  const totalCartaoPago = round2(sum(parcelasRealizadas, (p) => p.gastoCartao));
  const totalEvolucaoCaixaPago = round2(sum(parcelasRealizadas, (p) => p.parcelaEvolucaoCaixa));
  const totalGastoAcumulado = round2(totalEmpreiteiroPago + totalAdmPago + totalCartaoPago);

  const totalEmpreiteiroPlanejado = round2(sum(parcelas.filter((p) => p.status !== 'REALIZADO'), (p) => p.totalEmpreiteiroPix));

  const parametros = state.parametros || {};
  const contratoTotalEmpreiteiro = Number(parametros.contratoTotalEmpreiteiro) || totalOrcadoCategorias;
  const recursoProprioPlanejado = Number(parametros.recursoProprioPlanejado) || 0;

  const saldoAPagarEmpreiteiro = round2(totalMedido - totalEmpreiteiroPago);
  const saldoContratoRestante = round2(contratoTotalEmpreiteiro - totalMedido);
  const totalInvestidoDisponivel = round2(recursoProprioPlanejado + caixaLiberadaAcumulada);
  const saldoRecursoDisponivel = round2(totalInvestidoDisponivel - totalGastoAcumulado);

  // Sugestão para a próxima parcela: o que já foi medido (avanço lançado) e ainda
  // não foi pago via nenhuma parcela realizada.
  const sugestaoProximaParcelaEmpreiteiro = Math.max(0, saldoAPagarEmpreiteiro);
  const sugestaoProximaParcelaAdm = round2(sugestaoProximaParcelaEmpreiteiro * (Number(parametros.taxaAdministracaoPercent) || 0));

  // Fluxo de caixa mensal: agrega entradas (recurso próprio + liberações PCI + ajustes)
  // e saídas (parcelas + ajustes) por mês (YYYY-MM), com saldo acumulado real.
  const monthsMap = new Map();
  function bucket(monthKey) {
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, {
        mes: monthKey,
        label: monthLabel(monthKey),
        entradaRecursoProprio: 0,
        entradaCaixaPCI: 0,
        entradaAjusteManual: 0,
        saidaEmpreiteiroPix: 0,
        saidaAdmPix: 0,
        saidaCartao: 0,
        saidaAjusteManual: 0,
      });
    }
    return monthsMap.get(monthKey);
  }

  const startMonthKey = monthKeyFromDateStr(state.meta?.dataInicio) || monthKeyFromDateStr(parcelas[0]?.vencimento) || 'sem-data';
  bucket(startMonthKey).entradaRecursoProprio += recursoProprioPlanejado;
  for (const etapa of liberacaoPCI) {
    if (!etapa.valorLiberado) continue;
    const mk = startMonthKey === 'sem-data' ? 'sem-data' : addMonthsToKey(startMonthKey, (Number(etapa.mesProgramado) || 1) - 1);
    bucket(mk).entradaCaixaPCI += etapa.valorLiberado;
  }
  for (const p of parcelas) {
    const mk = monthKeyFromDateStr(p.vencimento) || monthKeyFromDateStr(p.vencPlanejado) || 'sem-data';
    const b = bucket(mk);
    b.saidaEmpreiteiroPix += Number(p.totalEmpreiteiroPix) || 0;
    b.saidaAdmPix += Number(p.totalAdmPix) || 0;
    b.saidaCartao += Number(p.gastoCartao) || 0;
  }
  for (const ajuste of state.fluxoCaixaAjustes || []) {
    const mk = monthKeyFromDateStr(ajuste.data) || 'sem-data';
    const b = bucket(mk);
    if (ajuste.tipo === 'entrada') b.entradaAjusteManual += Number(ajuste.valor) || 0;
    else b.saidaAjusteManual += Number(ajuste.valor) || 0;
  }

  const fluxoCaixaMensal = [...monthsMap.values()]
    .sort((a, b) => (a.mes || '').localeCompare(b.mes || ''))
    .map((b) => {
      const entradaTotal = round2(b.entradaRecursoProprio + b.entradaCaixaPCI + b.entradaAjusteManual);
      const saidaTotal = round2(b.saidaEmpreiteiroPix + b.saidaAdmPix + b.saidaCartao + b.saidaAjusteManual);
      return {
        ...b,
        entradaRecursoProprio: round2(b.entradaRecursoProprio),
        entradaCaixaPCI: round2(b.entradaCaixaPCI),
        entradaAjusteManual: round2(b.entradaAjusteManual),
        entradaTotal,
        saidaEmpreiteiroPix: round2(b.saidaEmpreiteiroPix),
        saidaAdmPix: round2(b.saidaAdmPix),
        saidaCartao: round2(b.saidaCartao),
        saidaAjusteManual: round2(b.saidaAjusteManual),
        saidaTotal,
      };
    });
  let acumulado = 0;
  for (const m of fluxoCaixaMensal) {
    acumulado = round2(acumulado + m.entradaTotal - m.saidaTotal);
    m.saldoAcumuladoMes = acumulado;
  }

  const resumo = {
    totalOrcadoCategorias,
    contratoTotalEmpreiteiro,
    totalMedido,
    percObraGeral: round2(percObraGeral * 10000) / 10000,
    creditoCaixaTotalPCI,
    caixaLiberadaAcumulada,
    percCaixaLiberada: creditoCaixaTotalPCI > 0 ? round2((caixaLiberadaAcumulada / creditoCaixaTotalPCI) * 10000) / 10000 : 0,
    recursoProprioPlanejado,
    totalInvestidoDisponivel,
    totalEmpreiteiroPago,
    totalAdmPago,
    totalCartaoPago,
    totalEvolucaoCaixaPago,
    totalGastoAcumulado,
    totalEmpreiteiroPlanejado,
    saldoAPagarEmpreiteiro,
    saldoContratoRestante,
    saldoRecursoDisponivel,
    percValorTotalPago: contratoTotalEmpreiteiro > 0 ? round2((totalEmpreiteiroPago / contratoTotalEmpreiteiro) * 10000) / 10000 : 0,
    sugestaoProximaParcelaEmpreiteiro: round2(sugestaoProximaParcelaEmpreiteiro),
    sugestaoProximaParcelaAdm: round2(sugestaoProximaParcelaAdm),
  };

  return {
    meta: state.meta,
    parametros: state.parametros,
    categorias,
    liberacaoPCI,
    parcelas,
    fluxoCaixaMensal,
    fluxoCaixaAjustes: state.fluxoCaixaAjustes || [],
    historicoAvancos: state.historicoAvancos || [],
    resumo,
    updatedAt: state.updatedAt,
  };
}

module.exports = { recompute, round2, clamp };
