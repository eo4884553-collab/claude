'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { recompute } = require('./calc');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
}

function ok(res, state) {
  res.json(recompute(state));
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
    const { nome, valorOrcado, percAvancoManual, observacao } = req.body || {};
    if (nome !== undefined) cat.nome = nome;
    if (valorOrcado !== undefined) cat.valorOrcado = Number(valorOrcado);
    if (observacao !== undefined) cat.observacao = observacao;
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

// ---- Liberação PCI ----
app.put('/api/liberacao-pci/:etapa', async (req, res) => {
  const state = await store.mutate((s) => {
    const etapaNum = Number(req.params.etapa);
    const etapa = s.liberacaoPCI.find((e) => e.etapa === etapaNum);
    if (!etapa) throw Object.assign(new Error('etapa não encontrada'), { status: 404 });
    const { descricao, valor, percLimiteAcumulado, mesProgramado, liberadoManual } = req.body || {};
    if (descricao !== undefined) etapa.descricao = descricao;
    if (valor !== undefined) etapa.valor = Number(valor);
    if (percLimiteAcumulado !== undefined) etapa.percLimiteAcumulado = Number(percLimiteAcumulado);
    if (mesProgramado !== undefined) etapa.mesProgramado = Number(mesProgramado);
    if (liberadoManual !== undefined) etapa.liberadoManual = liberadoManual === null ? null : Number(liberadoManual);
  });
  ok(res, state);
});

// ---- Parcelas (aba Contas a Pagar — o que vai para o cliente) ----
app.post('/api/parcelas', async (req, res) => {
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
      vencimento: b.vencimento || null,
      vencPlanejado: b.vencPlanejado || null,
      status: b.status || 'PLANEJADO',
      obs: b.obs || '',
      overrides: {},
    });
  });
  ok(res, state);
});

app.put('/api/parcelas/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    const p = s.parcelas.find((x) => x.id === req.params.id);
    if (!p) throw Object.assign(new Error('parcela não encontrada'), { status: 404 });
    const fields = ['label', 'totalEmpreiteiroPix', 'totalAdmPix', 'gastoCartao', 'parcelaEvolucaoCaixa', 'vencimento', 'vencPlanejado', 'status', 'obs'];
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
  });
  ok(res, state);
});

app.delete('/api/parcelas/:id', async (req, res) => {
  const state = await store.mutate((s) => {
    s.parcelas = s.parcelas.filter((p) => p.id !== req.params.id);
  });
  ok(res, state);
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
