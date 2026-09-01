'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { recompute, computeCategoria, reorganizarPlanejamento, monthKeyFromDateStr, quinzenaFromDateStr, monthQuinzenaLabel } = require('./calc');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
}

// Soma N meses a uma data 'YYYY-MM-DD', preservando o dia (usado para gerar as
// datas de fatura de uma compra parcelada no cartão).
function addMonthsToDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Encontra a parcela existente (Contas a Pagar) cujo mês/quinzena bate com a
// data informada, ou cria uma nova só com o essencial (label automático,
// vencPlanejado, tudo mais zerado) — usada para "abastecer" automaticamente o
// gasto de cartão lançado no Detalhamento FC, sem duplicar parcelas.
function findOrCreateParcelaPorData(s, dataStr, labelSufixo) {
  const mesReferencia = monthKeyFromDateStr(dataStr);
  // Cartão é sempre pago na 1ª quinzena do mês da fatura (fechamento dia 05,
  // vencimento dia 15 — ver aba "Contas a pagar" da planilha original) — nunca
  // cai na 2ª parcela, independentemente do dia exato informado na compra.
  const quinzena = 1;
  let parcela = s.parcelas.find((p) => {
    const dataOcorrencia = p.vencimento || p.vencPlanejado || null;
    return monthKeyFromDateStr(dataOcorrencia) === mesReferencia && quinzenaFromDateStr(dataOcorrencia) === quinzena;
  });
  if (!parcela) {
    parcela = {
      id: newId('parcela'),
      label: `${monthQuinzenaLabel(mesReferencia, quinzena || 1)}${labelSufixo || ''}`,
      totalEmpreiteiroPix: 0,
      totalAdmPix: 0,
      gastoCartao: 0,
      totalATransferir: 0,
      parcelaEvolucaoCaixa: 0,
      custoTotal: 0,
      dataGeracaoCusto: dataStr,
      vencimento: null,
      vencPlanejado: dataStr,
      status: 'PLANEJADO',
      obs: '',
      overrides: {},
    };
    s.parcelas.push(parcela);
  }
  return parcela;
}

// Data "de calendário" de uma quinzena (mês/1ª ou 2ª parcela), seguindo a mesma
// convenção usada em toda a app (dia ≤15 = 1ª parcela, dia >15 = 2ª parcela):
// dia 10 para a 1ª, dia 25 para a 2ª — bate com os vencimentos reais extraídos
// da planilha (ex.: "10/08" e "25/08").
function dataQuinzena(mes, quinzena) {
  return `${mes}-${quinzena === 2 ? '25' : '10'}`;
}

// Soma o gasto no cartão já lançado no Detalhamento FC para a fatura de um mês
// específico (formaPagamento com "CARTÃO — fatura YYYY-MM") — usado para sugerir
// automaticamente o valor de cartão ao lançar o avanço de uma quinzena.
function sugestaoCartaoDoMes(s, mes) {
  let total = 0;
  for (const cat of s.categorias) {
    for (const it of cat.itens || []) {
      const m = /fatura\s+(\d{4}-\d{2})/i.exec(it.formaPagamento || '');
      if (m && m[1] === mes) total += Number(it.valorRealizado) || 0;
    }
  }
  return Math.round(total * 100) / 100;
}

function ok(res, state, ajuste) {
  const body = recompute(state);
  if (ajuste) body.ajusteAutomatico = ajuste;
  res.json(body);
}

// ---- Estado completo (todas as abas já calculadas) ----
app.get('/api/state', (req, res) => {
  ok(res, store.load());
});

app.post('/api/reset', async (req, res) => {
  const state = store.resetToSeed();
  ok(res, state);
});

// ---- Meta (dados da obra) ----
app.put('/api/meta', async (req, res) => {
  const state = await store.mutate((s) => {
    Object.assign(s.meta, req.body || {});
  });
  ok(res, state);
});

// ---- Parâmetros globais ----
app.put('/api/parametros', async (req, res) => {
  const state = await store.mutate((s) => {
    Object.assign(s.parametros, req.body || {});
  });
  ok(res, state);
});

// ---- Categorias (aba Detalhamento FC / Lançar Avanços) ----
app.put('/api/categorias/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.id);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    const { nome, valorOrcado, percAvancoManual, observacao, verbaCaixa, liberadoCaixaManual } = req.body || {};
    if (nome !== undefined) cat.nome = nome;
    if (valorOrcado !== undefined) cat.valorOrcado = Number(valorOrcado);
    if (observacao !== undefined) cat.observacao = observacao;
    if (verbaCaixa !== undefined) cat.verbaCaixa = Number(verbaCaixa);
    if (liberadoCaixaManual !== undefined) cat.liberadoCaixaManual = liberadoCaixaManual === null ? null : Number(liberadoCaixaManual);
    if (percAvancoManual !== undefined) {
      cat.percAvancoManual = percAvancoManual === null ? null : Number(percAvancoManual);
      cat.dataUltimoAvanco = new Date().toISOString().slice(0, 10);
    }
  });
  ok(res, state);
});

// Lança um avanço físico (registra no histórico e define o % manual da categoria).
app.post('/api/categorias/:id/avanco', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.id);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    const { perc, data, obs } = req.body || {};
    if (perc === undefined || perc === null) throw Object.assign(new Error('perc é obrigatório'), { status: 400 });
    const percAvancoAnterior = cat.percAvancoManual;
    cat.percAvancoManual = Number(perc);
    cat.dataUltimoAvanco = data || new Date().toISOString().slice(0, 10);
    if (obs !== undefined) cat.observacao = obs;
    s.historicoAvancos.unshift({
      id: newId('avanco'),
      categoriaId: cat.id,
      categoriaNome: cat.nome,
      percAvancoAnterior,
      percAvancoNovo: cat.percAvancoManual,
      data: cat.dataUltimoAvanco,
      obs: obs || '',
      timestamp: new Date().toISOString(),
    });
  });
  ok(res, state);
});

// Volta a categoria para o modo automático (percentual = soma dos itens).
app.post('/api/categorias/:id/avanco/limpar', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.id);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    cat.percAvancoManual = null;
  });
  ok(res, state);
});

// ---- Itens (linhas do Detalhamento FC dentro de cada categoria) ----
app.post('/api/categorias/:id/itens', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.id);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    const { descricao, unidade, valorOrcado, valorRealizado, dataPagamento, formaPagamento } = req.body || {};
    cat.itens.push({
      id: newId('item'),
      descricao: descricao || 'Novo item',
      unidade: unidade || '',
      valorOrcado: Number(valorOrcado) || 0,
      valorRealizado: Number(valorRealizado) || 0,
      dataPagamento: dataPagamento || null,
      formaPagamento: formaPagamento || '',
    });
  });
  ok(res, state);
});

app.put('/api/categorias/:catId/itens/:itemId', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.catId);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    const item = cat.itens.find((i) => i.id === req.params.itemId);
    if (!item) throw Object.assign(new Error('item não encontrado'), { status: 404 });
    const { descricao, unidade, valorOrcado, valorRealizado, dataPagamento, formaPagamento } = req.body || {};
    if (descricao !== undefined) item.descricao = descricao;
    if (unidade !== undefined) item.unidade = unidade;
    if (valorOrcado !== undefined) item.valorOrcado = Number(valorOrcado);
    if (valorRealizado !== undefined) item.valorRealizado = Number(valorRealizado);
    if (dataPagamento !== undefined) item.dataPagamento = dataPagamento;
    if (formaPagamento !== undefined) item.formaPagamento = formaPagamento;
  });
  ok(res, state);
});

app.delete('/api/categorias/:catId/itens/:itemId', async (req, res) => {
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.catId);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    cat.itens = cat.itens.filter((i) => i.id !== req.params.itemId);
  });
  ok(res, state);
});

// Lança uma compra parcelada no cartão: cria N itens (um por parcela) no
// Detalhamento FC da categoria e soma automaticamente cada parcela na
// respectiva parcela de Contas a Pagar (mês/quinzena da fatura) — sem precisar
// editar o cartão manualmente em Contas a Pagar depois.
app.post('/api/categorias/:id/compra-parcelada', async (req, res) => {
  let compraParcelada = null;
  const state = await store.mutate((s) => {
    const cat = s.categorias.find((c) => c.id === req.params.id);
    if (!cat) throw Object.assign(new Error('categoria não encontrada'), { status: 404 });
    const b = req.body || {};
    const descricao = (b.descricao || 'Compra no cartão').trim();
    const valorTotal = Math.round((Number(b.valorTotal) || 0) * 100) / 100;
    const qtdParcelas = Math.max(1, Math.min(48, Math.round(Number(b.qtdParcelas) || 1)));
    const dataCompra = b.dataCompra || new Date().toISOString().slice(0, 10);
    const primeiraFatura = b.primeiraFatura || dataCompra;
    if (!valorTotal || valorTotal <= 0) throw Object.assign(new Error('Informe o valor total da compra.'), { status: 400 });

    const valorParcelaBase = Math.round((valorTotal / qtdParcelas) * 100) / 100;
    const itensCriados = [];
    const parcelasAfetadas = [];
    for (let i = 0; i < qtdParcelas; i++) {
      const valorParcela = i === qtdParcelas - 1
        ? Math.round((valorTotal - valorParcelaBase * (qtdParcelas - 1)) * 100) / 100
        : valorParcelaBase;
      const dataFatura = addMonthsToDate(primeiraFatura, i);
      const item = {
        id: newId('item'),
        descricao: qtdParcelas > 1 ? `${descricao} (parcela ${i + 1}/${qtdParcelas})` : descricao,
        unidade: b.unidade || 'UNID',
        valorOrcado: 0,
        valorRealizado: valorParcela,
        dataPagamento: dataCompra,
        formaPagamento: `CARTÃO — fatura ${dataFatura.slice(0, 7)}`,
      };
      cat.itens.push(item);
      itensCriados.push(item.id);

      const parcela = findOrCreateParcelaPorData(s, dataFatura, ' (cartão)');
      parcela.gastoCartao = Math.round(((Number(parcela.gastoCartao) || 0) + valorParcela) * 100) / 100;
      if (!parcela.overrides?.custoTotal) {
        parcela.custoTotal = Math.round(((Number(parcela.totalEmpreiteiroPix) || 0) + (Number(parcela.totalAdmPix) || 0) + (Number(parcela.gastoCartao) || 0) + (Number(parcela.parcelaEvolucaoCaixa) || 0)) * 100) / 100;
      }
      parcelasAfetadas.push({ id: parcela.id, label: parcela.label, valor: valorParcela });
    }
    compraParcelada = { qtdParcelas, valorTotal, itensCriados, parcelasAfetadas };
  });
  const body = recompute(state);
  body.compraParcelada = compraParcelada;
  res.json(body);
});

// ---- Liberação PCI (cronograma macro planejado — 6 etapas, sem "liberado"
// próprio: o valor realmente liberado pelo banco é rastreado à parte, em
// liberacoesCaixa, porque na planilha original o banco libera por medição
// mensal, sem seguir o % de obra das etapas) ----
app.put('/api/liberacao-pci/:etapa', async (req, res) => {
  const state = await store.mutate((s) => {
    const etapaNum = Number(req.params.etapa);
    const etapa = s.liberacaoPCI.find((e) => e.etapa === etapaNum);
    if (!etapa) throw Object.assign(new Error('etapa não encontrada'), { status: 404 });
    const { descricao, valor, percLimiteAcumulado, mesProgramado } = req.body || {};
    if (descricao !== undefined) etapa.descricao = descricao;
    if (valor !== undefined) etapa.valor = Number(valor);
    if (percLimiteAcumulado !== undefined) etapa.percLimiteAcumulado = Number(percLimiteAcumulado);
    if (mesProgramado !== undefined) etapa.mesProgramado = Number(mesProgramado);
  });
  ok(res, state);
});

// ---- Liberações reais do CAIXA (medições mensais efetivamente pagas pelo
// banco — cada uma lançada manualmente pelo proprietário conforme o extrato,
// igual à planilha original) ----
app.post('/api/liberacoes-caixa', async (req, res) => {
  const state = await store.mutate((s) => {
    const b = req.body || {};
    s.liberacoesCaixa = s.liberacoesCaixa || [];
    s.liberacoesCaixa.push({
      id: newId('liberacao'),
      data: b.data || new Date().toISOString().slice(0, 10),
      valor: Number(b.valor) || 0,
      obs: b.obs || '',
    });
  });
  ok(res, state);
});

app.delete('/api/liberacoes-caixa/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    s.liberacoesCaixa = (s.liberacoesCaixa || []).filter((l) => l.id !== req.params.id);
  });
  ok(res, state);
});

// ---- Itens que consumiram o recurso próprio (aba Parâmetros — cada um
// editável/adicionável; o saldo de recurso próprio disponível é recalculado
// automaticamente como planejado − soma da lista) ----
app.post('/api/consumos-recurso-proprio', async (req, res) => {
  const state = await store.mutate((s) => {
    const b = req.body || {};
    s.consumosRecursoProprio = s.consumosRecursoProprio || [];
    s.consumosRecursoProprio.push({
      id: newId('consumo'),
      descricao: b.descricao || 'Novo item',
      valor: Number(b.valor) || 0,
    });
  });
  ok(res, state);
});

app.put('/api/consumos-recurso-proprio/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    const item = (s.consumosRecursoProprio || []).find((c) => c.id === req.params.id);
    if (!item) return;
    const { descricao, valor } = req.body || {};
    if (descricao !== undefined) item.descricao = descricao;
    if (valor !== undefined) item.valor = Number(valor);
  });
  ok(res, state);
});

app.delete('/api/consumos-recurso-proprio/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    s.consumosRecursoProprio = (s.consumosRecursoProprio || []).filter((c) => c.id !== req.params.id);
  });
  ok(res, state);
});

// ---- Parcelas (aba Contas a Pagar — o que vai para o cliente) ----
app.post('/api/parcelas', async (req, res) => {
  let ajuste = null;
  const state = await store.mutate((s) => {
    const b = req.body || {};
    s.parcelas.push({
      id: newId('parcela'),
      label: b.label || 'NOVA PARCELA',
      totalEmpreiteiroPix: Number(b.totalEmpreiteiroPix) || 0,
      totalAdmPix: Number(b.totalAdmPix) || 0,
      gastoCartao: Number(b.gastoCartao) || 0,
      totalATransferir: Number(b.totalATransferir) || 0,
      parcelaEvolucaoCaixa: Number(b.parcelaEvolucaoCaixa) || 0,
      custoTotal: Number(b.custoTotal) || 0,
      dataGeracaoCusto: b.dataGeracaoCusto || null,
      vencimento: b.vencimento || null,
      vencPlanejado: b.vencPlanejado || null,
      status: b.status || 'PLANEJADO',
      obs: b.obs || '',
      overrides: {},
    });
    if ((b.status || 'PLANEJADO') === 'REALIZADO') ajuste = reorganizarPlanejamento(s);
  });
  ok(res, state, ajuste);
});

app.put('/api/parcelas/:id', async (req, res) => {
  let ajuste = null;
  const state = await store.mutate((s) => {
    const p = s.parcelas.find((x) => x.id === req.params.id);
    if (!p) throw Object.assign(new Error('parcela não encontrada'), { status: 404 });
    const fields = ['label', 'totalEmpreiteiroPix', 'totalAdmPix', 'gastoCartao', 'parcelaEvolucaoCaixa', 'dataGeracaoCusto', 'vencimento', 'vencPlanejado', 'status', 'obs'];
    for (const f of fields) if (req.body[f] !== undefined) p[f] = req.body[f];
    // totalATransferir e custoTotal normalmente são calculados; se vierem no body,
    // tratamos como override manual explícito (ex.: banco liberou valor diferente).
    if (req.body.totalATransferir !== undefined) {
      p.totalATransferir = Number(req.body.totalATransferir);
      p.overrides.totalATransferir = true;
    }
    if (req.body.custoTotal !== undefined) {
      p.custoTotal = Number(req.body.custoTotal);
      p.overrides.custoTotal = true;
    }
    if (req.body.limparOverrides) p.overrides = {};
    // Ao marcar (ou editar valores de) uma parcela REALIZADO, reorganiza as
    // planejadas restantes para não ultrapassar o orçado do contrato.
    if (p.status === 'REALIZADO' && (req.body.status !== undefined || req.body.totalEmpreiteiroPix !== undefined)) {
      ajuste = reorganizarPlanejamento(s);
    }
  });
  ok(res, state, ajuste);
});

app.delete('/api/parcelas/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    s.parcelas = s.parcelas.filter((p) => p.id !== req.params.id);
  });
  ok(res, state);
});

// ---- Lançamento de avanço por quinzena (aba "Lançar Avanços"): igual à
// planilha original — dois lançamentos por mês (1ª e 2ª parcela), cada um
// define o % acumulado de cada categoria que avançou naquela quinzena. O
// sistema calcula a diferença de valor (peso já estipulado de cada categoria),
// desconta o cartão já lançado no Detalhamento FC para aquele mês, e gera
// automaticamente a parcela correspondente em Contas a Pagar (mês/quinzena
// exatos), já com PIX empreiteiro + ADM calculados. Cartão nunca é cobrado na
// 2ª quinzena (sempre pago na 1ª — fechamento dia 05, vencimento dia 15). ----
app.post('/api/lancamento-quinzena', async (req, res) => {
  let ajuste = null;
  const state = await store.mutate((s) => {
    const b = req.body || {};
    const avancos = Array.isArray(b.avancos) ? b.avancos : [];
    if (!avancos.length) throw Object.assign(new Error('Informe o novo % de ao menos uma categoria.'), { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(b.mes || '')) throw Object.assign(new Error('Informe o mês (YYYY-MM).'), { status: 400 });
    const quinzena = Number(b.quinzena) === 2 ? 2 : 1;
    const mes = b.mes;
    const vencPlanejado = dataQuinzena(mes, quinzena);

    let valorGeradoPeriodo = 0;
    const detalhes = [];

    for (const a of avancos) {
      const cat = s.categorias.find((c) => c.id === a.categoriaId);
      const novoPerc = Number(a.novoPerc);
      if (!cat || !Number.isFinite(novoPerc)) continue;
      const percAnteriorEfetivo = computeCategoria(cat).percAvancoEfetivo;
      if (Math.abs(novoPerc - percAnteriorEfetivo) < 0.0001) continue;

      const valorOrcado = Number(cat.valorOrcado) || 0;
      valorGeradoPeriodo += valorOrcado * (novoPerc - percAnteriorEfetivo);

      const percAvancoManualAnterior = cat.percAvancoManual;
      cat.percAvancoManual = novoPerc;
      cat.dataUltimoAvanco = b.dataGeracaoCusto || vencPlanejado;
      s.historicoAvancos.unshift({
        id: newId('avanco'),
        categoriaId: cat.id,
        categoriaNome: cat.nome,
        percAvancoAnterior: percAvancoManualAnterior,
        percAvancoNovo: novoPerc,
        data: b.dataGeracaoCusto || vencPlanejado,
        obs: b.obs || '',
        timestamp: new Date().toISOString(),
      });
      detalhes.push(`${cat.nome}: ${(percAnteriorEfetivo * 100).toFixed(1)}% → ${(novoPerc * 100).toFixed(1)}%`);
    }

    if (!detalhes.length) throw Object.assign(new Error('Nenhuma categoria teve o % alterado.'), { status: 400 });

    valorGeradoPeriodo = Math.round(valorGeradoPeriodo * 100) / 100;
    // Cartão sempre pago na 1ª quinzena — na 2ª, o gasto do cartão é sempre zero.
    const gastoCartao = quinzena === 2 ? 0 : Math.round((Number(b.gastoCartao) || 0) * 100) / 100;
    const taxaAdm = Number(s.parametros.taxaAdministracaoPercent) || 0;
    const totalEmpreiteiroPix = Math.round(Math.max(0, valorGeradoPeriodo - gastoCartao) * 100) / 100;
    // ADM (10%) incide sobre PIX + cartão juntos — o cartão também consome a verba
    // do empreiteiro, só muda o canal de pagamento.
    const totalAdmPix = Math.round((totalEmpreiteiroPix + gastoCartao) * taxaAdm * 100) / 100;
    const obsAuto = `Avanço da quinzena (valor gerado: R$ ${valorGeradoPeriodo.toFixed(2)}) — ${detalhes.join('; ')}`;
    const label = `${monthQuinzenaLabel(mes, quinzena)}`;

    s.parcelas.push({
      id: newId('parcela'),
      label,
      totalEmpreiteiroPix,
      totalAdmPix,
      gastoCartao,
      totalATransferir: Math.round((totalEmpreiteiroPix + totalAdmPix) * 100) / 100,
      parcelaEvolucaoCaixa: 0,
      custoTotal: Math.round((totalEmpreiteiroPix + totalAdmPix + gastoCartao) * 100) / 100,
      dataGeracaoCusto: b.dataGeracaoCusto || vencPlanejado,
      vencimento: b.status === 'REALIZADO' ? (b.vencimento || vencPlanejado) : null,
      vencPlanejado,
      status: b.status || 'PLANEJADO',
      obs: b.obs ? `${b.obs} — ${obsAuto}` : obsAuto,
      overrides: {},
    });
    if ((b.status || 'PLANEJADO') === 'REALIZADO') ajuste = reorganizarPlanejamento(s);
  });
  ok(res, state, ajuste);
});

// Sugestão automática de gasto no cartão para uma quinzena, somando os itens do
// Detalhamento FC lançados como compra parcelada cuja fatura cai naquele mês
// (só faz sentido para a 1ª quinzena — cartão nunca cai na 2ª).
app.get('/api/sugestao-cartao/:mes', (req, res) => {
  const s = store.load();
  res.json({ mes: req.params.mes, gastoCartao: sugestaoCartaoDoMes(s, req.params.mes) });
});

// ---- Ajustes manuais no fluxo de caixa mensal ----
app.post('/api/fluxo-caixa-ajustes', async (req, res) => {
  const state = await store.mutate((s) => {
    const b = req.body || {};
    s.fluxoCaixaAjustes.push({
      id: newId('ajuste'),
      data: b.data || new Date().toISOString().slice(0, 10),
      tipo: b.tipo === 'entrada' ? 'entrada' : 'saida',
      valor: Number(b.valor) || 0,
      descricao: b.descricao || '',
    });
  });
  ok(res, state);
});

app.delete('/api/fluxo-caixa-ajustes/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    s.fluxoCaixaAjustes = s.fluxoCaixaAjustes.filter((a) => a.id !== req.params.id);
  });
  ok(res, state);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`App Liberação Caixa & Empreitada rodando em http://localhost:${PORT}`);
});
