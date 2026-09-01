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

// Datas previstas de início/término por categoria, extraídas da aba "Cronograma de
// obra" (linha PREVISTO, colunas D/E/F) da planilha original. A própria coluna
// "% REAL." (G) dessa linha PREVISTO na planilha é inconsistente (mistura valores
// fixos com fórmulas como =3/9 e =SOMA(faixa de semanas) que não são usadas em
// nenhum outro cálculo da planilha — o resumo "% EXECUTADA DE OBRA" em B48 só
// referencia a linha REALIZADO). Por isso o app calcula o "% previsto" de forma
// limpa a partir das datas (ver calcPercPrevisto em calc.js) em vez de reproduzir
// aquela coluna quebrada.
const CRONOGRAMA_PREVISTO = {
  1: { inicio: '2026-05-11', termino: '2026-06-05', duracaoDias: 26 },
  2: { inicio: '2026-06-08', termino: '2026-08-07', duracaoDias: 61 },
  3: { inicio: '2026-08-10', termino: '2026-10-16', duracaoDias: 68 },
  4: { inicio: '2026-10-05', termino: '2026-11-06', duracaoDias: 33 },
  5: { inicio: '2026-11-02', termino: '2026-12-11', duracaoDias: 40 },
  6: { inicio: '2026-12-07', termino: '2027-01-08', duracaoDias: 33 },
  7: { inicio: '2026-10-19', termino: '2026-12-04', duracaoDias: 47 },
  8: { inicio: '2026-12-07', termino: '2027-01-16', duracaoDias: 41 },
  9: { inicio: '2027-01-11', termino: '2027-03-12', duracaoDias: 61 },
  10: { inicio: '2027-02-15', termino: '2027-03-26', duracaoDias: 40 },
  11: { inicio: '2027-02-22', termino: '2027-04-09', duracaoDias: 47 },
  12: { inicio: '2027-03-22', termino: '2027-05-14', duracaoDias: 54 },
  13: { inicio: '2027-03-29', termino: '2027-05-28', duracaoDias: 61 },
  14: { inicio: '2027-05-12', termino: '2027-06-13', duracaoDias: 33 },
  15: { inicio: '2026-10-26', termino: '2027-02-05', duracaoDias: 103 },
  16: { inicio: '2026-10-26', termino: '2027-01-29', duracaoDias: 96 },
  17: { inicio: '2026-10-26', termino: '2027-01-09', duracaoDias: 76 },
  18: { inicio: '2027-05-26', termino: '2027-06-27', duracaoDias: 33 },
  19: { inicio: '2027-06-28', termino: '2027-07-23', duracaoDias: 26 },
  20: { inicio: '2027-07-21', termino: '2027-08-14', duracaoDias: 25 },
};

// Verba CAIXA por categoria — extraída da aba "Fluxo de Caixa" original (as
// linhas "CAIXA" logo abaixo de cada categoria, colunas AV "peso %" e AY
// "$AY$6 × peso", onde $AY$6 = 1.500.000 − 384.000 = 1.116.000, a fatia do
// crédito CAIXA destinada à obra em si, sem contar o lote). É um valor de
// verba DIFERENTE do valorOrcado (que é a verba do CONTRATO do empreiteiro,
// vinda do Detalhamento FC) — as duas coisas são, no fundo, o mesmo serviço
// visto por duas fontes de dinheiro diferentes, e no workbook original elas
// não batem exatamente entre si (ver README). A categoria 1 (Serviços
// Preliminares) não tem verba CAIXA aqui porque é paga direto pelo
// proprietário (fora do PCI) — a etapa 1 do PCI (aquisição do lote,
// R$384.000) cobre isso separadamente.
const VERBA_CAIXA_POR_CATEGORIA = {
  1: 32252.4,
  2: 76334.4,
  3: 192286.8,
  4: 76334.4,
  5: 72874.8,
  6: 26449.2,
  7: 40287.6,
  8: 30690,
  9: 80575.2,
  10: 19530,
  11: 46090.8,
  12: 47541.6,
  13: 103564.8,
  14: 13838.4,
  15: 42966,
  16: 42966,
  17: 46090.8,
  18: 47541.6,
  19: 10378.8,
  20: 67183.2,
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
      cronogramaPrevisto: CRONOGRAMA_PREVISTO[numero] || null,
      verbaCaixa: VERBA_CAIXA_POR_CATEGORIA[numero] || 0,
      liberadoCaixaManual: null,
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
