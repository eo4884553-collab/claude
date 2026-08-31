'use strict';
/**
 * Seed inicial do banco de dados (data/db.json), extraído da planilha real
 * "Planilha_planejamento_casas_executiva_Toscana_v2_2.xlsx" (abas Detalhamento F.C,
 * Contas a pagar, Liberação PCI e Parâmetros). Este arquivo só é usado na primeira
 * execução (quando data/db.json ainda não existe) — depois disso o banco vive em
 * data/db.json e é editado pelo app.
 */

const categoriasExtraidas = require('./categorias_extracted.json');
const parcelasExtraidas = require('./parcelas_extracted.json');

function slug(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// % de avanço FÍSICO real, extraído da aba "Cronograma de obra" (linha REALIZADO)
// da planilha original. Usado como override inicial porque, para várias categorias
// (05 a 19), a coluna "Realizado" do Detalhamento FC apenas espelha o valor total do
// contrato (fórmula ='Fluxo de Caixa '!AS..) e NÃO reflete execução real — o avanço
// físico do Cronograma é a fonte confiável até que medições reais sejam lançadas.
const AVANCO_FISICO_INICIAL = {
  1: 1.0, // Serviços Preliminares e Gerais — concluído
  2: 1.0, // Infraestrutura — concluído
  3: 0.5, // Suprastrutura — em execução
  4: 0.5, // Paredes e Painéis — em execução
  20: 0.5, // Outros Serviços — em execução
  // Demais categorias (05 a 19): ainda não iniciadas fisicamente (0%).
};

function buildCategorias() {
  return categoriasExtraidas.map((c, idx) => {
    const numero = idx + 1;
    const id = `cat-${String(numero).padStart(2, '0')}-${slug(c.nome).slice(0, 24)}`;
    const itens = (c.itens || []).map((it, itIdx) => ({
      id: `${id}-item-${itIdx + 1}`,
      descricao: it.descricao,
      unidade: it.unidade || '',
      valorOrcado: Number(it.valorOrcado) || 0,
      valorRealizado: Number(it.valorRealizado) || 0,
      dataPagamento: it.dataPagamento || null,
      formaPagamento: it.formaPagamento || '',
    }));
    return {
      id,
      numero,
      nome: c.nome,
      valorOrcado: Number(c.valorOrcado) || 0,
      // % de avanço físico/financeiro informado manualmente na aba "Lançar Avanços".
      // Quando null, o sistema usa o percentual derivado da soma dos itens (Detalhamento FC).
      percAvancoManual: numero in AVANCO_FISICO_INICIAL ? AVANCO_FISICO_INICIAL[numero] : 0,
      dataUltimoAvanco: '2026-06-10',
      observacao: '',
      // Categoria 1 (Serviços Preliminares) é paga direto pelo proprietário a
      // terceiros (topografia, projetos, prefeitura, cartório) — não passa pelo
      // contrato do empreiteiro nem pelas parcelas de Contas a Pagar. Por isso
      // essa flag soma o realizado dela na conta geral de "gasto acumulado" /
      // saldo de recurso disponível, senão o dinheiro já gasto aqui "some" do
      // acompanhamento financeiro.
      pagoDiretoProprietario: numero === 1,
      itens,
    };
  });
}

function buildParcelas() {
  return parcelasExtraidas.map((p, idx) => ({
    id: `parcela-${idx + 1}`,
    label: p.label,
    totalEmpreiteiroPix: Number(p.totalEmpreiteiroPix) || 0,
    totalAdmPix: Number(p.totalAdmPix) || 0,
    gastoCartao: Number(p.gastoCartao) || 0,
    totalATransferir: Number(p.totalATransferir) || 0,
    parcelaEvolucaoCaixa: Number(p.parcelaEvolucaoCaixa) || 0,
    custoTotal: Number(p.custoTotal) || 0,
    vencimento: p.vencimento ? p.vencimento.slice(0, 10) : null,
    vencPlanejado: p.vencPlanejado ? p.vencPlanejado.slice(0, 10) : null,
    status: p.status || 'PLANEJADO',
    obs: p.obs || '',
    // campos calculados automaticamente (totalATransferir, custoTotal) podem ser
    // sobrescritos manualmente; overrides marca quais campos o usuário travou.
    overrides: {},
  }));
}

function buildLiberacaoPCI() {
  return [
    { etapa: 1, descricao: 'Aquisição do lote', percLimiteAcumulado: 0, valor: 384000, mesProgramado: 1, liberadoManual: null },
    { etapa: 2, descricao: 'Fundação', percLimiteAcumulado: 0.20, valor: 153000, mesProgramado: 3, liberadoManual: null },
    { etapa: 3, descricao: 'Estrutura', percLimiteAcumulado: 0.40, valor: 244000, mesProgramado: 6, liberadoManual: null },
    { etapa: 4, descricao: 'Alvenaria', percLimiteAcumulado: 0.60, valor: 244000, mesProgramado: 9, liberadoManual: null },
    { etapa: 5, descricao: 'Cobertura + Instalações', percLimiteAcumulado: 0.80, valor: 254000, mesProgramado: 12, liberadoManual: null },
    { etapa: 6, descricao: 'Acabamento Final', percLimiteAcumulado: 1.00, valor: 220000, mesProgramado: 15, liberadoManual: null },
  ];
}

function buildSeed() {
  return {
    meta: {
      obra: 'Casa Newton — Gran Park Toscana',
      endereco: 'Rua Sorano nº 43 - Gran Park Toscana - Vespasiano',
      proprietario: 'Newton Leandro / Helena Marina',
      responsavelTecnico: 'Emanuel Alef de Oliveira',
      areaM2: 349,
      dataInicio: '2026-05-11',
      previsaoTermino: '2027-08-14',
    },
    parametros: {
      recursoProprioPlanejado: 571143.99,
      financiamentoObraCaixa: 1200000,
      financiamentoLoteCaixa: 384000,
      creditoCaixaTotalPCI: 1499000,
      contratoTotalEmpreiteiro: 1081900,
      taxaAdministracaoPercent: 0.10,
      taxaJurosAnualCEF: 0.134,
    },
    categorias: buildCategorias(),
    liberacaoPCI: buildLiberacaoPCI(),
    parcelas: buildParcelas(),
    historicoAvancos: [],
    fluxoCaixaAjustes: [], // lançamentos manuais extras na aba Fluxo de Caixa (ex.: ajustes, estornos)
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { buildSeed };
