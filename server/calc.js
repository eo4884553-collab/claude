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

/** Quinzena (1ª ou 2ª parcela do mês) a partir do dia da data — dias 1-15 caem na
 * 1ª parcela, 16 em diante na 2ª, seguindo a mesma convenção das parcelas reais
 * da planilha (ex.: vencimentos por volta do dia 10 e do dia 25). */
function quinzenaFromDateStr(dateStr) {
  if (!dateStr) return null;
  const day = Number(String(dateStr).slice(8, 10));
  if (!day) return null;
  return day <= 15 ? 1 : 2;
}

function monthQuinzenaLabel(monthKey, quinzena) {
  if (!monthKey || monthKey === 'sem-data') return 'Sem data';
  const base = monthLabel(monthKey);
  return quinzena ? `${base} — ${quinzena}ª Parcela` : base;
}

/** % previsto (cronograma) de uma categoria na data de referência, com base no
 * intervalo início/término previsto: 0 antes de começar, 1 depois de terminar,
 * proporcional aos dias corridos no meio — abordagem linear padrão de curva S
 * planejada. Calculado no app (não reproduz a coluna "% REAL." da linha PREVISTO
 * da planilha original, que mistura valores fixos com fórmulas inconsistentes
 * e não é usada em nenhum outro cálculo da planilha). */
function calcPercPrevisto(cronogramaPrevisto, dataRef) {
  if (!cronogramaPrevisto || !cronogramaPrevisto.inicio || !cronogramaPrevisto.termino) return 0;
  const inicio = new Date(cronogramaPrevisto.inicio + 'T00:00:00');
  const termino = new Date(cronogramaPrevisto.termino + 'T00:00:00');
  const ref = new Date(dataRef + 'T00:00:00');
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime()) || Number.isNaN(ref.getTime())) return 0;
  if (ref <= inicio) return 0;
  if (ref >= termino) return 1;
  const totalMs = termino.getTime() - inicio.getTime();
  if (totalMs <= 0) return 1;
  return clamp((ref.getTime() - inicio.getTime()) / totalMs, 0, 1);
}

// Item "plug" de cada categoria (mão de obra + material do empreiteiro): não é um
// custo datado como os demais itens (cartão etc.), é a verba que sobra do orçado
// da categoria depois de descontar os outros itens já lançados. Nunca é ajustado
// para cima automaticamente (isso exigiria uma medição real) — só é reduzido
// (nunca abaixo de zero) quando os outros itens crescem, para o total da
// categoria nunca ultrapassar o orçado. Mesma lógica de "nunca infla sozinho,
// só encolhe para caber" já usada em reorganizarPlanejamento().
const ITEM_PLUG_REGEX = /m[ãa]o de obra/i;

/** Calcula os campos derivados de uma categoria (Detalhamento FC). */
function computeCategoria(cat, dataRef) {
  const valorOrcado = Number(cat.valorOrcado) || 0;
  const itensBrutos = cat.itens || [];
  const itemPlug = itensBrutos.find((it) => ITEM_PLUG_REGEX.test(it.descricao || ''));
  const somaOutrosItens = round2(sum(itensBrutos.filter((it) => it !== itemPlug), (it) => it.valorRealizado));
  const itensComPlug = itemPlug
    ? itensBrutos.map((it) => {
        if (it !== itemPlug) return it;
        const tetoPlug = Math.max(0, round2(valorOrcado - somaOutrosItens));
        const valorRealizadoOriginal = Number(it.valorRealizado) || 0;
        const valorRealizadoAjustado = Math.min(valorRealizadoOriginal, tetoPlug);
        return valorRealizadoAjustado === valorRealizadoOriginal
          ? it
          : { ...it, valorRealizado: valorRealizadoAjustado, valorRealizadoOriginal };
      })
    : itensBrutos;
  // Nota: itens individuais NÃO têm teto no seu próprio valorOrcado — um item
  // pode legitimamente custar mais do que a cotação inicial (ex.: "REGISTRO DO
  // LOTE" orçado em R$8.000 mas realizado em R$14.008,01, confirmado na planilha
  // original: 'Detalhamento F.C'!E16 soma os itens sem cap por linha). O teto de
  // medição "nunca mais que 100%" vale para a categoria como um todo — garantido
  // pelo item plug (que só encolhe, nunca infla) e pelo clamp de percAvancoEfetivo
  // logo abaixo — não para cada item isoladamente.
  const itens = itensComPlug;
  const valorRealizadoItens = round2(sum(itens, (it) => it.valorRealizado));
  const percAvancoItens = valorOrcado > 0 ? valorRealizadoItens / valorOrcado : 0;

  const temOverride = cat.percAvancoManual !== null && cat.percAvancoManual !== undefined;
  // Teto de medição: nunca mais que 100% da categoria como um todo.
  const percAvancoEfetivo = clamp(temOverride ? Number(cat.percAvancoManual) : percAvancoItens, 0, 1);
  const valorMedido = round2(valorOrcado * percAvancoEfetivo);

  const percPrevisto = calcPercPrevisto(cat.cronogramaPrevisto, dataRef);
  const valorPrevisto = round2(valorOrcado * percPrevisto);
  const statusCronograma = !cat.cronogramaPrevisto
    ? 'sem-dados'
    : percAvancoEfetivo >= 1
      ? 'concluido'
      : percAvancoEfetivo + 0.0001 >= percPrevisto
        ? 'no-prazo'
        : 'atrasado';

  // Verba CAIXA da categoria (crédito PCI destinado a esse serviço — diferente
  // do valorOrcado, que é a verba do contrato do empreiteiro). Libera na mesma
  // proporção do avanço físico efetivo da categoria, igual à lógica de
  // valorMedido — só que sobre o pool de crédito CAIXA em vez do contrato.
  const verbaCaixa = Number(cat.verbaCaixa) || 0;
  const caixaLiberadoAutoCategoria = round2(verbaCaixa * percAvancoEfetivo);
  const temOverrideCaixa = cat.liberadoCaixaManual !== null && cat.liberadoCaixaManual !== undefined;
  const caixaLiberadoCategoria = temOverrideCaixa ? round2(Number(cat.liberadoCaixaManual)) : caixaLiberadoAutoCategoria;

  return {
    ...cat,
    itens,
    valorRealizadoItens,
    percAvancoItens: round2(percAvancoItens * 10000) / 10000,
    percAvancoEfetivo: round2(percAvancoEfetivo * 10000) / 10000,
    origemPercAvanco: temOverride ? 'manual' : 'itens',
    valorMedido,
    saldoContratoCategoria: round2(valorOrcado - valorMedido),
    percPrevisto: round2(percPrevisto * 10000) / 10000,
    valorPrevisto,
    statusCronograma,
    verbaCaixa,
    caixaLiberadoAutoCategoria,
    caixaLiberadoCategoria,
    origemCaixaCategoria: temOverrideCaixa ? 'manual' : 'auto',
    saldoCaixaCategoria: round2(verbaCaixa - caixaLiberadoCategoria),
  };
}

// Etapas do cronograma macro planejado de liberação do CAIXA (Liberação PCI) —
// puramente informativo/planejamento (define o total de 1.5M e a curva
// "planejada"). O valor REALMENTE liberado pelo banco não segue esse
// cronograma por % de obra (confirmado contra a planilha original: o banco
// libera por medição mensal, em valores e datas que não batem com as 6
// etapas) — é rastreado à parte em liberacoesCaixa (ver recompute()).
function computeLiberacaoPCI(liberacaoPCI) {
  return [...liberacaoPCI].sort((a, b) => a.etapa - b.etapa);
}

function computeParcela(parcela) {
  const autoTotalATransferir = round2((Number(parcela.totalEmpreiteiroPix) || 0) + (Number(parcela.totalAdmPix) || 0));
  const autoCustoTotal = round2(autoTotalATransferir + (Number(parcela.gastoCartao) || 0) + (Number(parcela.parcelaEvolucaoCaixa) || 0));
  const overrides = parcela.overrides || {};

  // Mês/quinzena em que o custo efetivamente ocorre (vence) — usado para agrupar
  // corretamente "Mês/1º Parcela" e "Mês/2º Parcela" em todas as visões (Fluxo de
  // Caixa etc.), sempre a partir da data de vencimento, não da data de geração.
  const dataOcorrencia = parcela.vencimento || parcela.vencPlanejado || null;
  const mesReferencia = monthKeyFromDateStr(dataOcorrencia);
  const quinzena = quinzenaFromDateStr(dataOcorrencia);

  return {
    ...parcela,
    totalATransferir: overrides.totalATransferir ? Number(parcela.totalATransferir) : autoTotalATransferir,
    custoTotal: overrides.custoTotal ? Number(parcela.custoTotal) : autoCustoTotal,
    autoTotalATransferir,
    autoCustoTotal,
    mesReferencia,
    quinzena,
    mesReferenciaLabel: mesReferencia ? monthQuinzenaLabel(mesReferencia, quinzena || 1) : null,
  };
}

function recompute(state) {
  const dataRef = (state.meta && state.meta.dataReferenciaCronograma) || new Date().toISOString().slice(0, 10);
  const categoriasBase = (state.categorias || []).map((c) => computeCategoria(c, dataRef));
  const totalOrcadoCategorias = round2(sum(categoriasBase, (c) => c.valorOrcado));
  const totalMedido = round2(sum(categoriasBase, (c) => c.valorMedido));
  const totalPrevistoCronograma = round2(sum(categoriasBase, (c) => c.valorPrevisto));
  const percObraGeral = totalOrcadoCategorias > 0 ? totalMedido / totalOrcadoCategorias : 0;
  const percPrevistoGeral = totalOrcadoCategorias > 0 ? totalPrevistoCronograma / totalOrcadoCategorias : 0;
  const totalVerbaCaixaCategorias = round2(sum(categoriasBase, (c) => c.verbaCaixa));
  const totalCaixaLiberadoCategorias = round2(sum(categoriasBase, (c) => c.caixaLiberadoCategoria));

  // Peso de cada categoria sobre o orçado total — é o "peso já estipulado" usado
  // para ratear o avanço lançado na aba Fluxo de Caixa em valor financeiro.
  const categorias = categoriasBase.map((c) => ({
    ...c,
    peso: totalOrcadoCategorias > 0 ? round2((c.valorOrcado / totalOrcadoCategorias) * 10000) / 10000 : 0,
  }));

  const liberacaoPCI = computeLiberacaoPCI(state.liberacaoPCI || []);
  const creditoCaixaTotalPCI = round2(sum(liberacaoPCI, (e) => e.valor));

  // Custo do lote já executado (taxas e projetos, financiados pelo CAIXA) — ver
  // definição completa mais abaixo, junto de gastoAcumuladoPLS; extraído aqui
  // primeiro porque "Valor caixa liberado" também depende dele.
  const custoLoteExecutado = Number((state.parametros || {}).custoLoteExecutado) || 0;

  // Liberações reais do CAIXA (medições mensais efetivamente pagas pelo banco,
  // lançadas manualmente pelo proprietário conforme o extrato) — substitui o
  // cronograma de etapas como fonte de "quanto já foi liberado": confirmado
  // contra a planilha original que o banco não libera seguindo o % de obra
  // das 6 etapas, mas em medições mensais próprias (ex.: Junho R$177.000,60,
  // Julho R$132.580,80, Agosto R$35.823,60, Setembro R$91.071,18), somadas ao
  // valor que o CAIXA já passou para o lote (R$356.168,00, mesmo valor de
  // custoLoteExecutado) — "Valor caixa liberado" = medições + lote = R$792.644,18.
  const liberacoesCaixa = [...(state.liberacoesCaixa || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  // Só medições REALIZADO contam no valor efetivamente liberado (e em tudo que
  // depende dele — % caixa liberada, saldo caixa disponível, saldo de recurso
  // próprio auto) — mesma lógica de "parcela REALIZADO"/"avanço REALIZADO".
  // Entradas sem status (dados antigos) são tratadas como REALIZADO.
  const liberacoesCaixaRealizadas = liberacoesCaixa.filter((l) => l.status !== 'PLANEJADO');
  const caixaLiberadaAcumulada = round2(custoLoteExecutado + sum(liberacoesCaixaRealizadas, (l) => l.valor));

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
  // Categorias pagas direto pelo proprietário (fora do contrato do empreiteiro e fora
  // das parcelas de Contas a Pagar — ex.: Serviços Preliminares: topografia, projetos,
  // prefeitura, cartório). Sem isso, esse dinheiro já gasto não entraria no "gasto
  // acumulado" nem reduziria o saldo de recurso disponível.
  const totalPagoDiretoProprietario = round2(sum(categoriasBase.filter((c) => c.pagoDiretoProprietario), (c) => c.valorRealizadoItens));
  // "GASTO PLS + Provisão da Quizena" — mesma métrica da aba Contas a Pagar da
  // planilha original (célula C6 = 356168 + soma do "Custo Total" de cada
  // parcela já realizada). Soma o custoTotal de cada parcela tal como
  // armazenado (respeitando overrides já ajustados manualmente na planilha —
  // algumas linhas incluem a parcela de evolução caixa no custo total, outras
  // não), não o "empreiteiro+adm+cartão+evolução" recalculado — evita
  // divergir da planilha quando essas duas fórmulas não batem linha a linha.
  const gastoAcumuladoPLS = round2(custoLoteExecutado + sum(parcelasRealizadas, (p) => p.custoTotal));
  // Total geral gasto até agora (qualquer fonte, qualquer categoria) — usado para
  // o saldo de recurso disponível do app; inclui também o que foi pago direto
  // pelo proprietário (fora das parcelas de Contas a Pagar).
  const totalGastoAcumulado = round2(gastoAcumuladoPLS + totalPagoDiretoProprietario);

  const parcelasPlanejadas = parcelas.filter((p) => p.status !== 'REALIZADO');
  const totalEmpreiteiroPlanejado = round2(sum(parcelasPlanejadas, (p) => p.totalEmpreiteiroPix));
  // Total já planejado (ainda não lançado/realizado) para os próximos itens — soma o
  // custo total (empreiteiro + ADM + cartão + evolução caixa) de cada parcela futura.
  const totalPlanejadoFuturo = round2(sum(parcelasPlanejadas, (p) => p.custoTotal));

  const parametros = state.parametros || {};
  const contratoTotalEmpreiteiro = Number(parametros.contratoTotalEmpreiteiro) || totalOrcadoCategorias;
  const recursoProprioPlanejado = Number(parametros.recursoProprioPlanejado) || 0;

  // O que já saiu do "orçado" do contrato do empreiteiro: o cartão também conta,
  // porque quando o proprietário compra material no cartão em vez de repassar via
  // PIX, isso consome a mesma verba do contrato (só muda o canal de pagamento).
  const totalConsumidoContrato = round2(totalEmpreiteiroPago + totalCartaoPago);
  const saldoAPagarEmpreiteiro = round2(totalMedido - totalConsumidoContrato);
  const saldoContratoRestante = round2(contratoTotalEmpreiteiro - totalMedido);
  const totalInvestidoDisponivel = round2(recursoProprioPlanejado + caixaLiberadaAcumulada);
  const saldoRecursoDisponivelAuto = round2(totalInvestidoDisponivel - totalGastoAcumulado);
  // "Saldo de Recurso Disponível" (F6 da planilha original) não é uma fórmula viva:
  // na planilha ela soma só o "Total a Transferir" das primeiras parcelas em que o
  // recurso próprio foi de fato usado (antes de a liberação do CAIXA começar a fluir)
  // — Maio/1ª, Maio/2ª, Junho/1ª — mais a entrada do lote e os serviços preliminares
  // pagos direto. Em vez de travar essa lista, o app deixa o proprietário lançar e
  // editar cada item que consumiu o recurso próprio (consumosRecursoProprio) —
  // o saldo é recalculado automaticamente como planejado menos a soma da lista.
  // Um valor manual único (saldoRecursoDisponivelManual) ainda tem prioridade sobre
  // tudo, para os casos em que nem a lista reflete o saldo real em conta.
  const consumosRecursoProprio = [...(state.consumosRecursoProprio || [])];
  const totalConsumoRecursoProprio = round2(sum(consumosRecursoProprio, (c) => c.valor));
  const saldoRecursoProprioPorItens = round2(recursoProprioPlanejado - totalConsumoRecursoProprio);
  const temOverrideSaldoRecurso = parametros.saldoRecursoDisponivelManual !== null && parametros.saldoRecursoDisponivelManual !== undefined;
  const temItensConsumoRecursoProprio = consumosRecursoProprio.length > 0;
  let saldoRecursoDisponivel;
  let origemSaldoRecurso;
  if (temOverrideSaldoRecurso) {
    saldoRecursoDisponivel = round2(Number(parametros.saldoRecursoDisponivelManual));
    origemSaldoRecurso = 'manual';
  } else if (temItensConsumoRecursoProprio) {
    saldoRecursoDisponivel = saldoRecursoProprioPorItens;
    origemSaldoRecurso = 'itens';
  } else {
    saldoRecursoDisponivel = saldoRecursoDisponivelAuto;
    origemSaldoRecurso = 'auto';
  }

  // Sugestão para a próxima parcela: o que já foi medido (avanço lançado) e ainda
  // não foi pago via nenhum canal (PIX ou cartão) em nenhuma parcela realizada.
  // A administração (10%) incide sobre o valor total do empreiteiro incluindo o
  // que for pago via cartão — aqui, na sugestão, ainda não se sabe quanto será
  // cartão, então a base é só o PIX estimado (o usuário pode ajustar ao editar).
  const sugestaoProximaParcelaEmpreiteiro = Math.max(0, saldoAPagarEmpreiteiro);
  const sugestaoProximaParcelaAdm = round2(sugestaoProximaParcelaEmpreiteiro * (Number(parametros.taxaAdministracaoPercent) || 0));

  // Fluxo de caixa mensal: agrega entradas (recurso próprio + liberações PCI + ajustes)
  // e saídas (parcelas + ajustes) por mês E quinzena (1º/2º Parcela), com saldo
  // acumulado real — a mesma organização "Mês/1º Parcela · Mês/2º Parcela" usada
  // em Contas a Pagar, mantendo os meses na ordem cronológica correta.
  const monthsMap = new Map();
  function bucket(monthKey, quinzena) {
    const q = monthKey === 'sem-data' ? null : (quinzena || 1);
    const key = monthKey === 'sem-data' ? 'sem-data' : `${monthKey}-Q${q}`;
    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        mes: monthKey,
        quinzena: q,
        label: monthQuinzenaLabel(monthKey, q),
        entradaRecursoProprio: 0,
        entradaCaixaPCI: 0,
        entradaAjusteManual: 0,
        // entradaRealizada/entradaPlanejada e saidaRealizada/saidaPlanejada
        // dividem os mesmos valores acima pelo status da fonte (liberacoesCaixa
        // e parcelas, respectivamente) — recurso próprio e ajustes manuais não
        // têm campo de status próprio, então entram sempre como já realizados
        // (são valores já assumidos como certos/ocorridos no momento do lançamento).
        entradaRealizada: 0,
        entradaPlanejada: 0,
        saidaEmpreiteiroPix: 0,
        saidaAdmPix: 0,
        saidaCartao: 0,
        saidaAjusteManual: 0,
        saidaRealizada: 0,
        saidaPlanejada: 0,
      });
    }
    return monthsMap.get(key);
  }

  const startMonthKey = monthKeyFromDateStr(state.meta?.dataInicio) || monthKeyFromDateStr(parcelas[0]?.vencimento) || 'sem-data';
  const bInicial = bucket(startMonthKey, 1);
  bInicial.entradaRecursoProprio += recursoProprioPlanejado;
  bInicial.entradaRealizada += recursoProprioPlanejado;
  for (const lib of liberacoesCaixa) {
    const mk = monthKeyFromDateStr(lib.data) || 'sem-data';
    const b = bucket(mk, quinzenaFromDateStr(lib.data) || 1);
    const valorLib = Number(lib.valor) || 0;
    b.entradaCaixaPCI += valorLib;
    if (lib.status === 'PLANEJADO') b.entradaPlanejada += valorLib;
    else b.entradaRealizada += valorLib;
  }
  for (const p of parcelas) {
    const dataOcorrencia = p.vencimento || p.vencPlanejado || null;
    const mk = monthKeyFromDateStr(dataOcorrencia) || 'sem-data';
    const b = bucket(mk, quinzenaFromDateStr(dataOcorrencia));
    const empreiteiro = Number(p.totalEmpreiteiroPix) || 0;
    const adm = Number(p.totalAdmPix) || 0;
    const cartao = Number(p.gastoCartao) || 0;
    b.saidaEmpreiteiroPix += empreiteiro;
    b.saidaAdmPix += adm;
    b.saidaCartao += cartao;
    if (p.status === 'REALIZADO') b.saidaRealizada += empreiteiro + adm + cartao;
    else b.saidaPlanejada += empreiteiro + adm + cartao;
  }
  for (const ajuste of state.fluxoCaixaAjustes || []) {
    const mk = monthKeyFromDateStr(ajuste.data) || 'sem-data';
    const b = bucket(mk, quinzenaFromDateStr(ajuste.data));
    const valorAjuste = Number(ajuste.valor) || 0;
    if (ajuste.tipo === 'entrada') { b.entradaAjusteManual += valorAjuste; b.entradaRealizada += valorAjuste; }
    else { b.saidaAjusteManual += valorAjuste; b.saidaRealizada += valorAjuste; }
  }

  const fluxoCaixaMensal = [...monthsMap.values()]
    .sort((a, b) => {
      if (a.mes === 'sem-data') return 1;
      if (b.mes === 'sem-data') return -1;
      const c = a.mes.localeCompare(b.mes);
      return c !== 0 ? c : (a.quinzena || 0) - (b.quinzena || 0);
    })
    .map((b) => {
      const entradaTotal = round2(b.entradaRecursoProprio + b.entradaCaixaPCI + b.entradaAjusteManual);
      const saidaTotal = round2(b.saidaEmpreiteiroPix + b.saidaAdmPix + b.saidaCartao + b.saidaAjusteManual);
      return {
        ...b,
        entradaRecursoProprio: round2(b.entradaRecursoProprio),
        entradaCaixaPCI: round2(b.entradaCaixaPCI),
        entradaAjusteManual: round2(b.entradaAjusteManual),
        entradaRealizada: round2(b.entradaRealizada),
        entradaPlanejada: round2(b.entradaPlanejada),
        entradaTotal,
        saidaEmpreiteiroPix: round2(b.saidaEmpreiteiroPix),
        saidaAdmPix: round2(b.saidaAdmPix),
        saidaCartao: round2(b.saidaCartao),
        saidaAjusteManual: round2(b.saidaAjusteManual),
        saidaRealizada: round2(b.saidaRealizada),
        saidaPlanejada: round2(b.saidaPlanejada),
        saidaTotal,
      };
    });
  let acumulado = 0;
  for (const m of fluxoCaixaMensal) {
    acumulado = round2(acumulado + m.entradaTotal - m.saidaTotal);
    m.saldoAcumuladoMes = acumulado;
  }

  const saldoCaixaDisponivel = round2(creditoCaixaTotalPCI - caixaLiberadaAcumulada);
  const verbaDisponivelFutura = round2(saldoCaixaDisponivel + saldoRecursoDisponivel);

  const resumo = {
    totalOrcadoCategorias,
    contratoTotalEmpreiteiro,
    totalMedido,
    percObraGeral: round2(percObraGeral * 10000) / 10000,
    totalPrevistoCronograma,
    percPrevistoGeral: round2(percPrevistoGeral * 10000) / 10000,
    dataReferenciaCronograma: dataRef,
    totalVerbaCaixaCategorias,
    totalCaixaLiberadoCategorias,
    creditoCaixaTotalPCI,
    caixaLiberadaAcumulada,
    percCaixaLiberada: creditoCaixaTotalPCI > 0 ? round2((caixaLiberadaAcumulada / creditoCaixaTotalPCI) * 10000) / 10000 : 0,
    recursoProprioPlanejado,
    totalInvestidoDisponivel,
    // % Execução financeira: mesma fórmula da aba "Contas a pagar"!I6 da planilha
    // original (=C6/(1500000+A6)) — usa GASTO PLS + Provisão da Quizena (C6, sem o
    // pago direto pelo proprietário) sobre o total de financiamento disponível
    // (crédito CAIXA total + recurso próprio planejado). É uma % de execução do
    // financiamento total, não do que já foi liberado até agora.
    percExecucaoFinanceira: (creditoCaixaTotalPCI + recursoProprioPlanejado) > 0
      ? round2((gastoAcumuladoPLS / (creditoCaixaTotalPCI + recursoProprioPlanejado)) * 10000) / 10000
      : 0,
    totalEmpreiteiroPago,
    totalAdmPago,
    totalCartaoPago,
    totalEvolucaoCaixaPago,
    totalPagoDiretoProprietario,
    gastoAcumuladoPLS,
    totalGastoAcumulado,
    // "Crédito CAIXA disponível" (H6 da planilha) = crédito CAIXA total (PCI) menos o
    // GASTO PLS já executado (C6) — quanto ainda resta do financiamento CAIXA depois
    // de descontar tudo que já foi gasto (LOTE + parcelas realizadas). Diferente do
    // "Saldo Caixa (a liberar)", que só olha o que o banco ainda não liberou.
    creditoCaixaDisponivelContabil: round2(creditoCaixaTotalPCI - gastoAcumuladoPLS),
    totalEmpreiteiroPlanejado,
    totalPlanejadoFuturo,
    // Total consumido do contrato do empreiteiro (PIX + cartão) — o cartão também
    // reduz a verba dele, porque o valor gasto no cartão é abatido do que sobra
    // pra pagar via PIX (mesma regra usada em "Lançar avanço do mês").
    totalConsumidoContrato,
    saldoAPagarEmpreiteiro,
    saldoContratoRestante,
    saldoRecursoDisponivel,
    saldoRecursoDisponivelAuto,
    totalConsumoRecursoProprio,
    saldoRecursoProprioPorItens,
    origemSaldoRecurso,
    // "Saldo Caixa": quanto do crédito CAIXA (PCI) ainda falta ser liberado pelo banco.
    saldoCaixaDisponivel,
    // "Saldo Empreiteiro": quanto do contrato total ainda falta ser efetivamente pago
    // (PIX + cartão já consumido, contra o orçado do contrato).
    saldoContratoAPagarEmpreiteiro: round2(contratoTotalEmpreiteiro - totalConsumidoContrato),
    // % Avanço Empreiteiro (pago) e % Avanço Caixa (liberado) — para acompanhamento.
    percValorTotalPago: contratoTotalEmpreiteiro > 0 ? round2((totalConsumidoContrato / contratoTotalEmpreiteiro) * 10000) / 10000 : 0,
    sugestaoProximaParcelaEmpreiteiro: round2(sugestaoProximaParcelaEmpreiteiro),
    sugestaoProximaParcelaAdm: round2(sugestaoProximaParcelaAdm),
    // Verba disponível para itens futuros = Saldo Caixa (a liberar) + Saldo de recurso
    // disponível (recurso próprio + caixa já liberado − já gasto). Comparado contra o
    // total já planejado (parcelas ainda não realizadas) para alertar se estourar —
    // nada aqui é ajustado automaticamente, é só um alerta de acompanhamento.
    verbaDisponivelFutura,
    saldoParaFuturos: round2(verbaDisponivelFutura - totalPlanejadoFuturo),
  };

  return {
    meta: state.meta,
    parametros: state.parametros,
    categorias,
    liberacaoPCI,
    liberacoesCaixa,
    consumosRecursoProprio,
    parcelas,
    fluxoCaixaMensal,
    fluxoCaixaAjustes: state.fluxoCaixaAjustes || [],
    historicoAvancos: state.historicoAvancos || [],
    resumo,
    updatedAt: state.updatedAt,
  };
}

/**
 * Reorganiza as parcelas PLANEJADAS para que o total consumido do contrato do
 * empreiteiro (já realizado + ainda planejado) nunca ultrapasse o orçado
 * (parametros.contratoTotalEmpreiteiro). O cartão TAMBÉM consome essa verba
 * (mesma regra de "Lançar avanço do mês": cartão abate do que sobra pra pagar
 * via PIX) — por isso primeiro reserva-se o cartão já planejado, e só o PIX
 * planejado é reduzido proporcionalmente para caber no que sobra. O valor do
 * cartão em si nunca é alterado (normalmente já é gasto real/comprado); a
 * administração (10%) é sempre recalculada sobre PIX + cartão da parcela. Só
 * encolhe (nunca infla de volta sozinho). Retorna um resumo do ajuste, ou
 * `null` se nada precisou mudar. Muta `state.parcelas` diretamente.
 */
function reorganizarPlanejamento(state, dataAjuste) {
  const parametros = state.parametros || {};
  const contratoTotalEmpreiteiro = Number(parametros.contratoTotalEmpreiteiro) || 0;
  if (!contratoTotalEmpreiteiro) return null;

  const parcelas = state.parcelas || [];
  const realizadas = parcelas.filter((p) => p.status === 'REALIZADO');
  const totalConsumidoRealizado = round2(sum(realizadas, (p) => (Number(p.totalEmpreiteiroPix) || 0) + (Number(p.gastoCartao) || 0)));
  const tetoRestante = Math.max(0, round2(contratoTotalEmpreiteiro - totalConsumidoRealizado));

  const planejadas = parcelas.filter((p) => p.status !== 'REALIZADO');
  const somaCartaoPlanejado = round2(sum(planejadas, (p) => p.gastoCartao));
  const tetoParaPix = Math.max(0, round2(tetoRestante - somaCartaoPlanejado));
  const somaPixPlanejado = round2(sum(planejadas, (p) => p.totalEmpreiteiroPix));

  if (somaPixPlanejado <= 0 || somaPixPlanejado <= tetoParaPix) return null;

  const fator = tetoParaPix / somaPixPlanejado;
  const taxaAdm = Number(parametros.taxaAdministracaoPercent) || 0;
  const data = dataAjuste || new Date().toISOString().slice(0, 10);
  const nota = `[Ajustado automaticamente em ${data} para caber no orçado restante do contrato]`;
  for (const p of planejadas) {
    p.totalEmpreiteiroPix = round2((Number(p.totalEmpreiteiroPix) || 0) * fator);
    p.totalAdmPix = round2((p.totalEmpreiteiroPix + (Number(p.gastoCartao) || 0)) * taxaAdm);
    if (p.overrides) { p.overrides.totalATransferir = false; p.overrides.custoTotal = false; }
    if (!p.obs || !p.obs.includes('[Ajustado automaticamente')) {
      p.obs = p.obs ? `${p.obs} ${nota}` : nota;
    }
  }
  return { fator: round2(fator * 10000) / 10000, tetoPlanejado: tetoParaPix, somaPlanejadoAnterior: somaPixPlanejado, qtd: planejadas.length };
}

// Recalcula cat.percAvancoManual a partir do avanço REALIZADO mais recente
// (por data) no histórico dessa categoria — avanços PLANEJADO não contam,
// igual à lógica de "parcela REALIZADO" em Contas a Pagar: um avanço fica
// visível e editável na aba Lançar Avanços, mas só passa a valer no % de
// avanço efetivo (e em tudo que depende dele — Execução financeira, Crédito
// CAIXA disponível etc.) quando confirmado como REALIZADO. Chamada sempre
// que um item do histórico é criado/editado/excluído/tem o status alterado.
// Se não houver nenhum avanço REALIZADO para a categoria (ex.: o único foi
// excluído), o valor atual de percAvancoManual é preservado — o % de obra
// não "volta atrás" para um estado sem histórico algum (ex.: os valores
// iniciais vindos da planilha, que não têm entrada correspondente aqui).
function recomputeCategoriaPercManual(categoria, historicoAvancos) {
  const realizados = (historicoAvancos || [])
    .filter((h) => h.categoriaId === categoria.id && h.status === 'REALIZADO')
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
  if (realizados.length) {
    categoria.percAvancoManual = realizados[realizados.length - 1].percAvancoNovo;
  }
}

module.exports = {
  recompute, computeCategoria, reorganizarPlanejamento, recomputeCategoriaPercManual, round2, clamp,
  monthKeyFromDateStr, quinzenaFromDateStr, monthQuinzenaLabel, addMonthsToKey, monthLabel,
};
