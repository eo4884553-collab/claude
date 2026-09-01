'use strict';

/* ==========================================================================
   Estado global + utilidades
   ========================================================================== */
let STATE = null;
let ACTIVE_TAB = 'painel';
let PAINEL_CATEGORIA_SELECIONADA = null;
const OPEN_CATEGORIES = new Set();

// Filtro de quinzena selecionado em cada aba (persiste entre re-renders,
// {mes, quinzena} ou null = "Todas"). Cada aba tem sua própria seleção porque
// filtram tabelas diferentes.
let FILTRO_QUINZENA_AVANCOS = null;
let FILTRO_QUINZENA_CRONOGRAMA = null;
let FILTRO_QUINZENA_FLUXO = null;
let FILTRO_QUINZENA_PCI = null;

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function money(v) { return fmtBRL.format(Number(v) || 0); }
function pct(v, digits = 1) { return `${fmtNum.format((Number(v) || 0) * 100, digits)}%`; }
function dateBR(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Sugere o rótulo "Mês/1º ou 2º Parcela" a partir de uma data (dias 1-15 = 1ª parcela,
// 16 em diante = 2ª) — mesma convenção usada no cálculo do Fluxo de Caixa mensal.
function mesParcelaLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const quinzena = d <= 15 ? '1º' : '2º';
  return `${MONTH_NAMES_PT[m - 1].toUpperCase()}/${quinzena} PARCELA`;
}

// Rótulo "Mês/Ano — 1ª/2ª Parcela" a partir de um mês (YYYY-MM) + quinzena (1|2) —
// mesma convenção usada no servidor (monthQuinzenaLabel em calc.js).
function mesQuinzenaLabel(mes, quinzena) {
  if (!mes) return 'Sem data';
  const [y, m] = mes.split('-');
  return `${MONTH_NAMES_PT[Number(m) - 1]}/${y} — ${quinzena}ª Parcela`;
}

// {mes, quinzena} a partir de uma data 'YYYY-MM-DD' (dia ≤15 = 1ª parcela).
function periodoFromDateStr(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { mes: `${y}-${String(m).padStart(2, '0')}`, quinzena: d <= 15 ? 1 : 2 };
}

// Lista todos os períodos (mês/quinzena) entre o início da obra e a previsão de
// término, na mesma convenção de data usada nas parcelas reais (dia 10 = 1ª
// parcela, dia 25 = 2ª) — usada para o seletor de período em "Lançar Avanços".
function buildQuinzenaPeriods(dataInicio, previsaoTermino) {
  const out = [];
  if (!dataInicio) return out;
  let [y, m] = dataInicio.slice(0, 7).split('-').map(Number);
  const [yEnd, mEnd] = (previsaoTermino || dataInicio).slice(0, 7).split('-').map(Number);
  let guard = 0;
  while ((y < yEnd || (y === yEnd && m <= mEnd)) && guard < 120) {
    const mes = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ mes, quinzena: 1, vencPlanejado: `${mes}-10`, label: mesQuinzenaLabel(mes, 1) });
    out.push({ mes, quinzena: 2, vencPlanejado: `${mes}-25`, label: mesQuinzenaLabel(mes, 2) });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Descrição curta da origem do "Saldo de recurso próprio disponível" — usada
// nos cards do Dashboard/Painel; 'itens' = calculado pela lista itemizada em
// Parâmetros, 'manual' = valor único forçado (avançado), 'auto' = cálculo
// simples de fallback (nenhuma lista lançada e nenhum manual).
function origemSaldoRecursoLabel(origem, r) {
  if (origem === 'manual') return 'Ajustado manualmente (ver Parâmetros → Avançado)';
  if (origem === 'itens') return `Recurso próprio − itens consumidos (ver Parâmetros): ${money(r.totalConsumoRecursoProprio)}`;
  return `Execução financeira − gasto acumulado (${money(r.totalGastoAcumulado)})`;
}

// true se a data (YYYY-MM-DD) cair dentro da quinzena selecionada ({mes, quinzena}).
function dataNaQuinzena(dateStr, filtro) {
  if (!filtro) return true;
  const p = periodoFromDateStr(dateStr);
  return !!p && p.mes === filtro.mes && p.quinzena === filtro.quinzena;
}

// Seletor "Filtrar por quinzena" reutilizável nas abas Lançar Avanços,
// Cronograma de Obra, Fluxo de Caixa e Liberação PCI — filtra a tabela
// correspondente para mostrar só os lançamentos daquela quinzena exata.
function renderQuinzenaFilter({ periods, selected, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.style.maxWidth = '280px';
  wrap.style.marginBottom = '4px';
  wrap.innerHTML = `<label>Filtrar por quinzena
    <select class="cell-input">
      <option value="">Todas as quinzenas</option>
      ${periods.map((p) => `<option value="${p.mes}|${p.quinzena}">${esc(p.label)}</option>`).join('')}
    </select>
  </label>`;
  const select = wrap.querySelector('select');
  if (selected) select.value = `${selected.mes}|${selected.quinzena}`;
  select.addEventListener('change', () => {
    if (!select.value) { onChange(null); return; }
    const [mes, quinzena] = select.value.split('|');
    onChange({ mes, quinzena: Number(quinzena) });
  });
  return wrap;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.toggle('error', isError);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
}

// Mostra o toast do ajuste automático (quando o backend reorganizou as parcelas
// planejadas para caber no orçado). Retorna true se mostrou, para o chamador
// decidir se ainda quer exibir sua própria mensagem de sucesso por cima.
function toastAjuste(data) {
  if (!data || !data.ajusteAutomatico) return false;
  const a = data.ajusteAutomatico;
  toast(`Ajuste automático: ${a.qtd} parcela(s) planejada(s) reduzida(s) para caber no orçado restante do contrato (${money(a.tetoPlanejado)}).`);
  return true;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || `Erro (${res.status})`, true);
    throw new Error(data.error || 'request failed');
  }
  STATE = data;
  renderAll();
  return data;
}

/* ==========================================================================
   Bootstrap / navegação
   ========================================================================== */
async function loadState() {
  const res = await fetch('/api/state');
  STATE = await res.json();
  renderAll();
}

function setupTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    ACTIVE_TAB = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${ACTIVE_TAB}`; });
  });
}

function renderAll() {
  if (!STATE) return;
  document.getElementById('obraNome').textContent = STATE.meta?.obra || 'Obra';
  document.getElementById('obraEndereco').textContent = STATE.meta?.endereco || '';
  renderPainel();
  renderDashboard();
  renderAvancos();
  renderCronograma();
  renderDetalhamento();
  renderFluxo();
  renderPCI();
  renderParametros();
}

/* ==========================================================================
   Helpers de célula editável
   ========================================================================== */
// input numérico que salva no blur/Enter, evitando disparar requisições a cada tecla
function numberInput({ value, onSave, manual = false, step = '0.01', wide = false, min }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  if (min !== undefined) input.min = min;
  input.value = value ?? 0;
  input.className = `cell-input${manual ? ' manual' : ''}${wide ? ' wide' : ''}`;
  const commit = () => {
    const v = input.value === '' ? 0 : Number(input.value);
    if (v !== value) onSave(v);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

// input de valor monetário: exibe formatado ("R$ 31.000,00") em repouso; ao
// focar, troca para edição em número simples com vírgula decimal (mais fácil
// de digitar), reformatando ao sair do campo.
function moneyInput({ value, onSave, manual = false, wide = false }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = `cell-input${manual ? ' manual' : ''}${wide ? ' wide' : ''}`;
  input.value = money(value);
  function parseMoneyText(s) {
    let cleaned = String(s).trim().replace(/^R\$\s*/i, '');
    if (!cleaned) return 0;
    if (/,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  input.addEventListener('focus', () => {
    input.value = (Number(value) || 0) === 0 ? '' : String(Number(value)).replace('.', ',');
    input.select();
  });
  const commit = () => {
    const v = parseMoneyText(input.value);
    input.value = money(v);
    if (v !== value) onSave(v);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

// input percentual: mostra "42,5%" em repouso; ao focar, edita em número
// simples (0-100), reformatando ao sair. Valor salvo/recebido é sempre
// fração (0-1), igual aos demais campos de percentual do app.
function percentInput({ value, onSave, wide = false }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = `cell-input${wide ? ' wide' : ''}`;
  input.value = pct(value);
  input.addEventListener('focus', () => {
    input.value = String(Math.round((Number(value) || 0) * 1000) / 10).replace('.', ',');
    input.select();
  });
  const commit = () => {
    const raw = input.value.trim().replace(',', '.');
    const n = Number(raw);
    const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0;
    input.value = pct(v);
    if (v !== value) onSave(v);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

function textInput({ value, onSave, wide = false }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.className = `cell-input${wide ? ' wide' : ''}`;
  const commit = () => { if (input.value !== value) onSave(input.value); };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

function dateInput({ value, onSave }) {
  const input = document.createElement('input');
  input.type = 'date';
  input.value = value ? String(value).slice(0, 10) : '';
  input.className = 'cell-input';
  const commit = () => { if (input.value !== value) onSave(input.value || null); };
  input.addEventListener('change', commit);
  return input;
}

function selectInput({ value, options, onSave }) {
  const select = document.createElement('select');
  select.className = 'cell-input';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => onSave(select.value));
  return select;
}

function td(el) {
  const cell = document.createElement('td');
  if (el instanceof Node) cell.appendChild(el); else cell.innerHTML = el;
  return cell;
}

/* Bloco "verba para itens futuros": compara o que já está planejado (parcelas
   ainda não realizadas) com a verba disponível (Crédito CAIXA ainda a liberar +
   Saldo de recurso próprio disponível) e avisa quando estoura — não ajusta nada
   automaticamente, é só acompanhamento (usado no Dashboard e no Fluxo de Caixa). */
function renderVerbaFuturaBlock() {
  const r = STATE.resumo;
  const wrap = document.createElement('div');
  const estourou = r.saldoParaFuturos < 0;
  if (estourou) {
    const banner = document.createElement('div');
    banner.className = 'alert-banner';
    banner.textContent = `Atenção: os itens futuros já planejados (${money(r.totalPlanejadoFuturo)}) somam mais do que a verba disponível (${money(r.verbaDisponivelFutura)}) — falta ${money(Math.abs(r.saldoParaFuturos))}. Revise as parcelas planejadas ou aguarde mais liberação de caixa.`;
    wrap.appendChild(banner);
  }
  const cards = document.createElement('div');
  cards.className = 'cards-grid';
  cards.innerHTML = `
    <div class="card">
      <div class="card-label">Planejado futuro (a lançar)</div>
      <div class="card-value">${money(r.totalPlanejadoFuturo)}</div>
      <div class="card-sub">Soma das parcelas ainda não realizadas</div>
    </div>
    <div class="card">
      <div class="card-label">Verba disponível p/ futuros</div>
      <div class="card-value">${money(r.verbaDisponivelFutura)}</div>
      <div class="card-sub">Crédito CAIXA ainda a liberar (${money(r.saldoCaixaDisponivel)}) + Saldo de recurso próprio disponível (${money(r.saldoRecursoDisponivel)})</div>
    </div>
    <div class="card ${estourou ? 'warn' : 'good'}">
      <div class="card-label">Margem para itens futuros</div>
      <div class="card-value">${money(r.saldoParaFuturos)}</div>
      <div class="card-sub">${estourou ? 'Estourou a verba disponível' : 'Dentro da verba disponível'}</div>
    </div>
  `;
  wrap.appendChild(cards);
  return wrap;
}

/* ==========================================================================
   TAB — Dashboard Executivo (curva S + seleção "o que pagar")
   ========================================================================== */

// % previsto (mesma fórmula do server/calc.js) recalculado no cliente para
// poder amostrar o cronograma em vários pontos no tempo (curva planejada).
function calcPercPrevistoClient(cronogramaPrevisto, dataRef) {
  if (!cronogramaPrevisto || !cronogramaPrevisto.inicio || !cronogramaPrevisto.termino) return 0;
  const inicio = new Date(cronogramaPrevisto.inicio + 'T00:00:00');
  const termino = new Date(cronogramaPrevisto.termino + 'T00:00:00');
  const ref = new Date(dataRef + 'T00:00:00');
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime()) || Number.isNaN(ref.getTime())) return 0;
  if (ref <= inicio) return 0;
  if (ref >= termino) return 1;
  const totalMs = termino.getTime() - inicio.getTime();
  if (totalMs <= 0) return 1;
  return Math.max(0, Math.min(1, (ref.getTime() - inicio.getTime()) / totalMs));
}

function addMonthsISO(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Pontos de amostragem mensais entre início e término da obra (inclui o
// término exato mesmo que não caia num mês redondo) — base do eixo X das
// curvas S.
function buildMonthlyCheckpoints(startStr, endStr) {
  const out = [];
  let cur = startStr;
  let i = 0;
  while (cur < endStr && i < 60) {
    out.push(cur);
    i += 1;
    cur = addMonthsISO(startStr, i);
  }
  out.push(endStr);
  return out;
}

// Curva S do empreiteiro: planejado = soma do valor orçado de cada categoria
// ponderado pelo % previsto (cronograma) em cada checkpoint; executado =
// soma acumulada (PIX + cartão) das parcelas REALIZADO, na data real de
// ocorrência (mesmo valor que compõe "totalConsumidoContrato" no resumo).
function buildCurvaEmpreiteiro(checkpoints) {
  const categorias = STATE.categorias;
  const totalValue = STATE.resumo.contratoTotalEmpreiteiro;

  const planned = checkpoints.map((cp) => {
    let total = 0;
    for (const c of categorias) {
      total += (Number(c.valorOrcado) || 0) * calcPercPrevistoClient(c.cronogramaPrevisto, cp);
    }
    return Math.round(total * 100) / 100;
  });

  const realizadas = STATE.parcelas
    .filter((p) => p.status === 'REALIZADO')
    .map((p) => ({ data: (p.vencimento || p.vencPlanejado || '').slice(0, 10), valor: (Number(p.totalEmpreiteiroPix) || 0) + (Number(p.gastoCartao) || 0) }))
    .filter((p) => p.data)
    .sort((a, b) => a.data.localeCompare(b.data));

  let acc = 0;
  const executedRaw = realizadas.map((p) => { acc += p.valor; return { data: p.data, valor: Math.round(acc * 100) / 100 }; });

  const executed = checkpoints.map((cp) => {
    let last = 0;
    for (const e of executedRaw) { if (e.data <= cp) last = e.valor; else break; }
    return last;
  });

  return { checkpoints, planned, executed, executedRaw, totalValue };
}

// Curva S da caixa (liberação PCI): planejado = soma acumulada do valor de
// cada etapa PCI no mês programado (mesProgramado); executado = único ponto
// confiável que temos é o valor já liberado hoje (não há registro histórico
// datado de cada liberação do banco no modelo de dados) — mostrado como um
// "degrau" a partir de hoje, sem inventar posições intermediárias.
function buildCurvaCaixa(checkpoints, dataInicio) {
  const totalValue = STATE.resumo.creditoCaixaTotalPCI;
  const etapasComData = STATE.liberacaoPCI.map((e) => ({
    data: addMonthsISO(dataInicio, Math.max(0, (Number(e.mesProgramado) || 1) - 1)),
    valor: Number(e.valor) || 0,
  }));

  const planned = checkpoints.map((cp) => {
    let total = 0;
    for (const e of etapasComData) if (e.data <= cp) total += e.valor;
    return Math.round(total * 100) / 100;
  });

  // Executado: acumulado real das liberações do CAIXA — começa com o valor que
  // o CAIXA já passou do lote (taxas e projetos, financiado junto com a
  // aquisição do lote, etapa 1 do PCI) e soma as medições mensais lançadas
  // pelo proprietário, na data real de cada uma. Esse total precisa bater com
  // "Valor caixa liberado" do resumo (resumo.caixaLiberadaAcumulada).
  const custoLoteExecutado = Number((STATE.parametros || {}).custoLoteExecutado) || 0;
  const liberacoes = [...(STATE.liberacoesCaixa || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  let acc = custoLoteExecutado;
  const executedRaw = custoLoteExecutado > 0
    ? [{ data: dataInicio, valor: Math.round(acc * 100) / 100 }]
    : [];
  liberacoes.forEach((l) => { acc += Number(l.valor) || 0; executedRaw.push({ data: l.data, valor: Math.round(acc * 100) / 100 }); });
  const executed = checkpoints.map((cp) => {
    let last = 0;
    for (const e of executedRaw) { if (e.data <= cp) last = e.valor; else break; }
    return last;
  });

  return { checkpoints, planned, executed, executedRaw, totalValue };
}

// Componente genérico de curva S (SVG puro): linha "Planejado" (cinza) e
// "Executado" (cor de destaque) sobre o mesmo eixo de tempo, com legenda,
// crosshair + tooltip ao passar o mouse, marca de "hoje" e tabela de apoio.
function renderSCurveCard({ title, subtitle, curve, hojeStr }) {
  const card = document.createElement('div');
  card.className = 'panel scurve-card';

  const W = 720, H = 300, padL = 46, padR = 16, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = curve.checkpoints.length;
  const xAt = (i) => padL + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const maxVal = Math.max(curve.totalValue, ...curve.planned, ...curve.executed) * 1.02 || 1;
  const yAt = (v) => padT + plotH - (v / maxVal) * plotH;

  const pathFrom = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const plannedPath = pathFrom(curve.planned);
  const executedPath = pathFrom(curve.executed);
  const areaPath = `${executedPath} L${xAt(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const gridFracs = [0, 0.25, 0.5, 0.75, 1];
  const hojeIdx = curve.checkpoints.findIndex((cp) => cp >= hojeStr);
  const hojeI = hojeIdx === -1 ? n - 1 : hojeIdx;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'scurve-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title}: curva planejado x executado`);

  let defs = `<defs><linearGradient id="scurveFill-${title.replace(/\W+/g, '')}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.16" />
    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.01" />
  </linearGradient></defs>`;
  const gradId = `scurveFill-${title.replace(/\W+/g, '')}`;

  let grid = '';
  for (const f of gridFracs) {
    const y = padT + plotH - f * plotH;
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="scurve-grid" />`;
    grid += `<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" class="scurve-axis-label" text-anchor="end">${Math.round(f * 100)}%</text>`;
  }

  // Rótulos do eixo X: um a cada ~2 meses para não poluir.
  let xlabels = '';
  const step = Math.max(1, Math.round(n / 8));
  for (let i = 0; i < n; i += step) {
    const [y, m] = curve.checkpoints[i].split('-');
    xlabels += `<text x="${xAt(i).toFixed(1)}" y="${H - 10}" class="scurve-axis-label" text-anchor="middle">${MONTH_NAMES_PT[Number(m) - 1].slice(0, 3)}/${y.slice(2)}</text>`;
  }

  const hojeX = xAt(hojeI).toFixed(1);
  const hojeLine = `<line x1="${hojeX}" y1="${padT}" x2="${hojeX}" y2="${padT + plotH}" class="scurve-hoje" />`;

  const endPlanned = curve.planned[hojeI] ?? curve.planned[n - 1];
  const endExecuted = curve.executed[hojeI] ?? curve.executed[n - 1];

  svg.innerHTML = `
    ${defs}
    <g>${grid}</g>
    <path d="${areaPath}" fill="url(#${gradId})" stroke="none"></path>
    <path d="${plannedPath}" class="scurve-line planned"></path>
    <path d="${executedPath}" class="scurve-line executed"></path>
    ${hojeLine}
    <circle cx="${hojeX}" cy="${yAt(endExecuted).toFixed(1)}" r="4.5" class="scurve-dot executed"></circle>
    <circle cx="${hojeX}" cy="${yAt(endPlanned).toFixed(1)}" r="4.5" class="scurve-dot planned"></circle>
    <g>${xlabels}</g>
  `;

  const wrap = document.createElement('div');
  wrap.className = 'scurve-wrap';
  const tooltip = document.createElement('div');
  tooltip.className = 'scurve-tooltip';
  tooltip.hidden = true;
  wrap.appendChild(svg);
  wrap.appendChild(tooltip);

  const hitArea = document.createElementNS(svgNS, 'rect');
  hitArea.setAttribute('x', padL); hitArea.setAttribute('y', padT);
  hitArea.setAttribute('width', plotW); hitArea.setAttribute('height', plotH);
  hitArea.setAttribute('fill', 'transparent');
  svg.appendChild(hitArea);
  const crosshair = document.createElementNS(svgNS, 'line');
  crosshair.setAttribute('class', 'scurve-crosshair');
  crosshair.setAttribute('y1', padT); crosshair.setAttribute('y2', padT + plotH);
  crosshair.setAttribute('hidden', 'true');
  svg.appendChild(crosshair);

  const onMove = (evt) => {
    const rect = svg.getBoundingClientRect();
    const xFrac = (evt.clientX - rect.left) / rect.width;
    const xSvg = xFrac * W;
    let idx = Math.round(((xSvg - padL) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    crosshair.removeAttribute('hidden');
    crosshair.setAttribute('x1', xAt(idx)); crosshair.setAttribute('x2', xAt(idx));
    const [y, m, d] = curve.checkpoints[idx].split('-');
    tooltip.hidden = false;
    tooltip.style.left = `${(xAt(idx) / W) * 100}%`;
    tooltip.innerHTML = `
      <div class="scurve-tooltip-date">${d}/${m}/${y}</div>
      <div class="scurve-tooltip-row"><span class="scurve-key executed"></span>Executado <strong>${money(curve.executed[idx])}</strong> (${pct(curve.totalValue > 0 ? curve.executed[idx] / curve.totalValue : 0)})</div>
      <div class="scurve-tooltip-row"><span class="scurve-key planned"></span>Planejado <strong>${money(curve.planned[idx])}</strong> (${pct(curve.totalValue > 0 ? curve.planned[idx] / curve.totalValue : 0)})</div>
    `;
  };
  const onLeave = () => { crosshair.setAttribute('hidden', 'true'); tooltip.hidden = true; };
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);

  const gapVal = endExecuted - endPlanned;
  const gapPct = curve.totalValue > 0 ? gapVal / curve.totalValue : 0;

  card.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>${esc(title)}</h2>
        <div class="muted">${esc(subtitle)}</div>
      </div>
      <div class="scurve-legend">
        <span><span class="scurve-key executed"></span>Executado</span>
        <span><span class="scurve-key planned"></span>Planejado</span>
        <span class="scurve-key-sep"></span>
        <span>Hoje: <strong>${pct(curve.totalValue > 0 ? endExecuted / curve.totalValue : 0)}</strong> executado vs. <strong>${pct(curve.totalValue > 0 ? endPlanned / curve.totalValue : 0)}</strong> planejado</span>
      </div>
    </div>
  `;
  card.appendChild(wrap);

  const gapNote = document.createElement('div');
  gapNote.className = `scurve-gap-note ${gapVal >= 0 ? 'good' : 'warn'}`;
  gapNote.textContent = gapVal >= 0
    ? `Adiantado/em dia: ${money(gapVal)} acima do planejado até hoje (${pct(Math.abs(gapPct))}).`
    : `Atrasado: falta ${money(Math.abs(gapVal))} para alcançar o planejado até hoje (${pct(Math.abs(gapPct))}).`;
  card.appendChild(gapNote);

  const details = document.createElement('details');
  details.className = 'scurve-table-details';
  details.innerHTML = `<summary>Ver tabela de apoio (valores por mês)</summary>`;
  const tblWrap = document.createElement('div');
  tblWrap.className = 'table-scroll';
  tblWrap.innerHTML = `<table class="data"><thead><tr>
    <th>Mês</th><th class="num">Planejado</th><th class="num">Executado</th><th class="num">Diferença</th>
  </tr></thead><tbody>${curve.checkpoints.map((cp, i) => {
    const diff = curve.executed[i] - curve.planned[i];
    return `<tr><td>${dateBR(cp)}</td><td class="num">${money(curve.planned[i])}</td><td class="num">${money(curve.executed[i])}</td><td class="num">${diff >= 0 ? '+' : ''}${money(diff)}</td></tr>`;
  }).join('')}</tbody></table>`;
  details.appendChild(tblWrap);
  card.appendChild(details);

  return card;
}

function renderPainel() {
  const root = document.getElementById('tab-painel');
  root.innerHTML = '';
  const r = STATE.resumo;

  const kpis = document.createElement('div');
  kpis.className = 'cards-grid';
  kpis.innerHTML = `
    <div class="card accent">
      <div class="card-label">Contrato total empreiteiro</div>
      <div class="card-value">${money(r.contratoTotalEmpreiteiro)}</div>
      <div class="card-sub">Executado: ${money(r.totalConsumidoContrato)} · ${pct(r.percValorTotalPago)}</div>
    </div>
    <div class="card accent">
      <div class="card-label">Crédito CAIXA (PCI) total</div>
      <div class="card-value">${money(r.creditoCaixaTotalPCI)}</div>
      <div class="card-sub">Liberado: ${money(r.caixaLiberadaAcumulada)} · ${pct(r.percCaixaLiberada)}</div>
    </div>
    <div class="card">
      <div class="card-label">Recurso próprio planejado</div>
      <div class="card-value">${money(r.recursoProprioPlanejado)}</div>
      <div class="card-sub">Execução financeira (caixa liberado + recurso próprio): ${money(r.totalInvestidoDisponivel)}</div>
    </div>
    <div class="card ${r.percObraGeral + 0.0001 >= r.percPrevistoGeral ? 'good' : 'warn'}">
      <div class="card-label">% Obra: real x previsto</div>
      <div class="card-value">${pct(r.percObraGeral)} <span class="muted" style="font-size:13px">/ ${pct(r.percPrevistoGeral)}</span></div>
      <div class="card-sub">${r.percObraGeral + 0.0001 >= r.percPrevistoGeral ? 'No prazo ou adiantada' : 'Atrasada vs. cronograma'}</div>
    </div>
    <div class="card ${r.saldoRecursoDisponivel < 0 ? 'warn' : 'good'}">
      <div class="card-label">Saldo de recurso próprio disponível</div>
      <div class="card-value">${money(r.saldoRecursoDisponivel)}</div>
      <div class="card-sub">${origemSaldoRecursoLabel(r.origemSaldoRecurso, r)}</div>
    </div>
    <div class="card ${r.saldoParaFuturos < 0 ? 'warn' : 'good'}">
      <div class="card-label">Margem p/ itens futuros</div>
      <div class="card-value">${money(r.saldoParaFuturos)}</div>
      <div class="card-sub">Verba disponível − planejado futuro</div>
    </div>
  `;
  root.appendChild(kpis);

  const hoje = r.dataReferenciaCronograma;
  const checkpointsEmp = buildMonthlyCheckpoints(STATE.meta.dataInicio, STATE.meta.previsaoTermino);
  const curvaEmp = buildCurvaEmpreiteiro(checkpointsEmp);
  const curvaCaixa = buildCurvaCaixa(checkpointsEmp, STATE.meta.dataInicio);

  const chartsGrid = document.createElement('div');
  chartsGrid.className = 'scurve-grid';
  chartsGrid.appendChild(renderSCurveCard({
    title: 'Curva S — Empreiteiro',
    subtitle: 'Valor pago ao empreiteiro (PIX + cartão) acumulado — planejado (cronograma) x executado (parcelas realizadas)',
    curve: curvaEmp, hojeStr: hoje,
  }));
  chartsGrid.appendChild(renderSCurveCard({
    title: 'Curva S — Caixa (liberação PCI)',
    subtitle: 'Crédito CAIXA liberado acumulado — planejado (etapas PCI, cronograma macro) x executado (liberações reais lançadas em Liberação PCI, por data)',
    curve: curvaCaixa, hojeStr: hoje,
  }));
  root.appendChild(chartsGrid);

  // Seleção de categoria: mostra claramente o que falta pagar para o item clicado.
  const selPanel = document.createElement('div');
  selPanel.className = 'panel';
  selPanel.innerHTML = `<div class="panel-header"><div><h2>O que pagar — selecione uma categoria</h2>
    <div class="muted">Clique numa linha para ver claramente o valor orçado, já medido/pago e o saldo restante do contrato dessa categoria.</div></div></div>`;
  const selBody = document.createElement('div');
  selBody.className = 'painel-select-body';

  const listWrap = document.createElement('div');
  listWrap.className = 'table-scroll painel-select-list';
  const table = document.createElement('table');
  table.className = 'data';
  table.innerHTML = `<thead><tr><th>Nº</th><th class="wrap">Categoria</th><th class="num">% avanço</th><th class="num">Saldo do contrato</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.dataset.catId = c.id;
    tr.innerHTML = `<td>${c.numero}</td><td class="wrap">${esc(c.nome)}</td><td class="num">${pct(c.percAvancoEfetivo)}</td><td class="num">${money(c.saldoContratoCategoria)}</td>`;
    tr.onclick = () => { PAINEL_CATEGORIA_SELECIONADA = c.id; renderPainel(); };
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  listWrap.appendChild(table);
  selBody.appendChild(listWrap);

  const detailWrap = document.createElement('div');
  detailWrap.className = 'painel-select-detail';
  const selecionada = STATE.categorias.find((c) => c.id === PAINEL_CATEGORIA_SELECIONADA) || STATE.categorias[0];
  if (selecionada) {
    const info = STATUS_CRONOGRAMA_INFO[selecionada.statusCronograma] || STATUS_CRONOGRAMA_INFO['sem-dados'];
    detailWrap.innerHTML = `
      <h3>${esc(selecionada.nome)}</h3>
      <span class="badge ${info.badge}">${info.label}</span>
      <div class="painel-detail-grid">
        <div><div class="muted">Valor orçado</div><strong>${money(selecionada.valorOrcado)}</strong></div>
        <div><div class="muted">% avanço efetivo</div><strong>${pct(selecionada.percAvancoEfetivo)}</strong></div>
        <div><div class="muted">Valor medido</div><strong>${money(selecionada.valorMedido)}</strong></div>
        <div><div class="muted">Saldo do contrato (falta pagar)</div><strong>${money(selecionada.saldoContratoCategoria)}</strong></div>
        <div><div class="muted">% previsto (cronograma)</div><strong>${pct(selecionada.percPrevisto)}</strong></div>
        <div><div class="muted">Janela prevista</div><strong>${selecionada.cronogramaPrevisto ? `${dateBR(selecionada.cronogramaPrevisto.inicio)} – ${dateBR(selecionada.cronogramaPrevisto.termino)}` : '—'}</strong></div>
      </div>
      <div class="muted" style="margin-top:8px">${esc(selecionada.nome)} representa ${pct(selecionada.peso)} do contrato total. O saldo do contrato é o que ainda falta pagar ao empreiteiro por essa categoria especificamente (valor orçado − valor já medido).</div>
    `;
  } else {
    detailWrap.innerHTML = '<div class="muted">Selecione uma categoria na lista.</div>';
  }
  selBody.appendChild(detailWrap);
  selPanel.appendChild(selBody);
  root.appendChild(selPanel);
}

/* ==========================================================================
   TAB 1 — Dashboard "Contas a Pagar" (visão do cliente)
   ========================================================================== */
function renderDashboard() {
  const root = document.getElementById('tab-dashboard');
  const r = STATE.resumo;
  root.innerHTML = '';

  const cards = document.createElement('div');
  cards.className = 'cards-grid';
  cards.innerHTML = `
    <div class="card accent">
      <div class="card-label">Contrato total empreiteiro</div>
      <div class="card-value">${money(r.contratoTotalEmpreiteiro)}</div>
      <div class="card-sub">Executado (medido): ${money(r.totalMedido)} · ${pct(r.percObraGeral)}</div>
    </div>
    <div class="card good">
      <div class="card-label">Avanço empreiteiro (% pago)</div>
      <div class="card-value">${pct(r.percValorTotalPago)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percValorTotalPago * 100)}%"></span></div>
      <div class="card-sub">Consumido (PIX + cartão): ${money(r.totalConsumidoContrato)} · Saldo a pagar: ${money(r.saldoAPagarEmpreiteiro)}</div>
    </div>
    <div class="card">
      <div class="card-label">Saldo empreiteiro (falta do contrato)</div>
      <div class="card-value">${money(r.saldoContratoAPagarEmpreiteiro)}</div>
      <div class="card-sub">Contrato total − já consumido (PIX + cartão)</div>
    </div>
    <div class="card accent">
      <div class="card-label">% Execução financeira</div>
      <div class="card-value">${pct(r.percExecucaoFinanceira)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percExecucaoFinanceira * 100)}%"></span></div>
      <div class="card-sub">Gasto PLS + provisão da quinzena (${money(r.gastoAcumuladoPLS)}) sobre o financiamento total disponível: crédito CAIXA (${money(r.creditoCaixaTotalPCI)}) + recurso próprio planejado (${money(r.recursoProprioPlanejado)})</div>
    </div>
    <div class="card">
      <div class="card-label">Crédito CAIXA disponível</div>
      <div class="card-value">${money(r.creditoCaixaDisponivelContabil)}</div>
      <div class="card-sub">Crédito CAIXA total − gasto PLS + provisão da quinzena</div>
    </div>
    <div class="card">
      <div class="card-label">Valor caixa liberado</div>
      <div class="card-value">${money(r.caixaLiberadaAcumulada)}</div>
      <div class="card-sub">Medições liberadas pelo banco (${money(r.caixaLiberadaAcumulada - (Number(STATE.parametros.custoLoteExecutado) || 0))}) + valor que o CAIXA já passou do lote (${money(STATE.parametros.custoLoteExecutado)})</div>
    </div>
    <div class="card ${r.saldoRecursoDisponivel < 0 ? 'warn' : 'good'}">
      <div class="card-label">Saldo de recurso próprio disponível</div>
      <div class="card-value">${money(r.saldoRecursoDisponivel)}</div>
      <div class="card-sub">${origemSaldoRecursoLabel(r.origemSaldoRecurso, r)}</div>
    </div>
    <div class="card">
      <div class="card-label">Total administração (RS Engenharia)</div>
      <div class="card-value">${money(r.totalAdmPago)}</div>
      <div class="card-sub">Taxa: ${pct(STATE.parametros.taxaAdministracaoPercent)}</div>
    </div>
    <div class="card">
      <div class="card-label">Gasto no cartão (realizado)</div>
      <div class="card-value">${money(r.totalCartaoPago)}</div>
      <div class="card-sub">Total gasto acumulado: ${money(r.totalGastoAcumulado)}</div>
    </div>
    <div class="card">
      <div class="card-label">Serviços preliminares</div>
      <div class="card-value">${money(r.totalPagoDiretoProprietario)}</div>
      <div class="card-sub">Pago direto pelo proprietário (fora do empreiteiro): topografia, projetos, prefeitura, cartório. Já descontado do saldo de recurso próprio disponível.</div>
    </div>
  `;
  root.appendChild(cards);
  root.appendChild(renderVerbaFuturaBlock());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Contas a Pagar — parcelas quinzenais (documento enviado ao cliente)</h2>
        <div class="muted">Editável em qualquer campo. "Total a transferir" e "Custo total" são calculados automaticamente, mas podem ser sobrescritos quando o valor real vier diferente do planejado.</div>
      </div>
      <button class="btn primary" id="btnNovaParcela">+ Nova parcela</button>
    </div>
    <div class="table-scroll"><table class="data" id="tblParcelas">
      <thead><tr>
        <th>Parcela</th><th>Mês / Parcela</th><th class="num">Empreiteiro (PIX)</th><th class="num">ADM (PIX)</th>
        <th class="num">Cartão</th><th class="num">Total a transferir</th><th class="num">Evolução Caixa</th>
        <th class="num">Custo total</th><th>Data do custo</th><th>Venc. planejado</th><th>Venc. real</th><th>Status</th><th class="wrap">Obs.</th><th></th>
      </tr></thead>
      <tbody></tbody>
      <tfoot></tfoot>
    </table></div>
  `;
  root.appendChild(panel);

  const tbody = panel.querySelector('tbody');
  for (const p of STATE.parcelas) {
    const tr = document.createElement('tr');
    tr.appendChild(td(textInput({ value: p.label, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { label: v }) })));
    tr.appendChild(td(`<span class="badge gray">${esc(p.mesReferenciaLabel || 'Sem data')}</span>`));
    tr.appendChild(td(moneyInput({ value: p.totalEmpreiteiroPix, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalEmpreiteiroPix: v }) })));
    tr.appendChild(td(moneyInput({ value: p.totalAdmPix, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalAdmPix: v }) })));
    tr.appendChild(td(moneyInput({ value: p.gastoCartao, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { gastoCartao: v }) })));
    tr.appendChild(td(moneyInput({ value: p.totalATransferir, manual: !!p.overrides?.totalATransferir, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalATransferir: v }) })));
    tr.appendChild(td(moneyInput({ value: p.parcelaEvolucaoCaixa, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { parcelaEvolucaoCaixa: v }) })));
    tr.appendChild(td(moneyInput({ value: p.custoTotal, manual: !!p.overrides?.custoTotal, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { custoTotal: v }) })));
    tr.appendChild(td(dateInput({ value: p.dataGeracaoCusto, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { dataGeracaoCusto: v }) })));
    tr.appendChild(td(dateInput({ value: p.vencPlanejado, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { vencPlanejado: v }) })));
    tr.appendChild(td(dateInput({ value: p.vencimento, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { vencimento: v }) })));
    tr.appendChild(td(selectInput({ value: p.status, options: ['PLANEJADO', 'REALIZADO'], onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { status: v }).then(toastAjuste) })));
    tr.appendChild(td(textInput({ value: p.obs, wide: true, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { obs: v }) })));
    const delTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
    delBtn.onclick = () => { if (confirm(`Remover parcela "${p.label}"?`)) api('DELETE', `/api/parcelas/${p.id}`); };
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  }

  const tfoot = panel.querySelector('tfoot');
  const sum = (f) => STATE.parcelas.reduce((a, p) => a + (Number(p[f]) || 0), 0);
  tfoot.innerHTML = `<tr>
    <td>TOTAL</td>
    <td></td>
    <td class="num">${money(sum('totalEmpreiteiroPix'))}</td>
    <td class="num">${money(sum('totalAdmPix'))}</td>
    <td class="num">${money(sum('gastoCartao'))}</td>
    <td class="num">${money(sum('totalATransferir'))}</td>
    <td class="num">${money(sum('parcelaEvolucaoCaixa'))}</td>
    <td class="num">${money(sum('custoTotal'))}</td>
    <td colspan="6"></td>
  </tr>`;

  document.getElementById('btnNovaParcela').onclick = () => openNovaParcelaModal();
}

function openNovaParcelaModal() {
  const r = STATE.resumo;
  openModal('Nova parcela (Contas a Pagar)', (body, close) => {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <label>Rótulo (ex.: SETEMBRO/3º PARCELA)
        <input name="label" value="NOVA PARCELA" required />
      </label>
      <label>Total empreiteiro (PIX)
        <input name="totalEmpreiteiroPix" type="number" step="0.01" value="${r.sugestaoProximaParcelaEmpreiteiro}" />
      </label>
      <label>Total ADM (PIX)
        <input name="totalAdmPix" type="number" step="0.01" value="${r.sugestaoProximaParcelaAdm}" />
      </label>
      <label>Gasto cartão
        <input name="gastoCartao" type="number" step="0.01" value="0" />
      </label>
      <label>Parcela evolução caixa
        <input name="parcelaEvolucaoCaixa" type="number" step="0.01" value="0" />
      </label>
      <label>Data em que o custo foi gerado
        <input name="dataGeracaoCusto" type="date" />
      </label>
      <label>Para qual mês/parcela ele vai ocorrer (vencimento planejado)
        <input name="vencPlanejado" type="date" />
      </label>
      <label>Vencimento real
        <input name="vencimento" type="date" />
      </label>
      <label>Status
        <select name="status"><option>PLANEJADO</option><option>REALIZADO</option></select>
      </label>
      <label style="grid-column: 1 / -1">Observação
        <textarea name="obs"></textarea>
      </label>
      <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn" id="cancelBtn">Cancelar</button>
        <button type="submit" class="btn primary">Criar parcela</button>
      </div>
    `;
    form.querySelector('#cancelBtn').onclick = close;

    // Cartão é sempre pago na 1ª quinzena do mês — nunca na 2ª (fechamento dia
    // 05, vencimento dia 15). Ao escolher a data, detecta a quinzena e já
    // sugere o valor de cartão lançado no Detalhamento FC para aquele mês.
    const cartaoInput = form.querySelector('[name="gastoCartao"]');
    const vencField = form.querySelector('[name="vencPlanejado"]');
    async function atualizarCartaoPorData() {
      const p = periodoFromDateStr(vencField.value);
      if (!p) return;
      if (p.quinzena === 2) {
        cartaoInput.value = '0';
        cartaoInput.disabled = true;
        cartaoInput.title = 'Cartão é sempre pago na 1ª quinzena do mês — nunca na 2ª.';
      } else {
        cartaoInput.disabled = false;
        cartaoInput.title = '';
        try {
          const res = await fetch(`/api/sugestao-cartao/${p.mes}`);
          const data = await res.json();
          cartaoInput.value = data.gastoCartao || 0;
        } catch { /* mantém o que já estava digitado */ }
      }
    }
    vencField.addEventListener('change', atualizarCartaoPorData);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const data = await api('POST', '/api/parcelas', payload);
      close();
      if (!toastAjuste(data)) toast('Parcela criada.');
    });
    body.appendChild(form);
    body.querySelector('.muted-hint')?.remove();
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = `Sugestão automática = medido até agora (${money(r.totalMedido)}) − já pago (${money(r.totalEmpreiteiroPago)}).`;
    body.prepend(hint);
  });
}

/* ==========================================================================
   TAB 2 — Lançar Avanços (modelo quinzenal — 2 lançamentos por mês, cada um
   já gera a parcela correspondente em Contas a Pagar)
   ========================================================================== */
function renderAvancos() {
  const root = document.getElementById('tab-avancos');
  root.innerHTML = '';

  root.appendChild(renderLancamentoQuinzenaPanel());

  const info = document.createElement('div');
  info.className = 'panel';
  info.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Avanço acumulado por categoria</h2>
        <div class="muted">Somatório de todas as quinzenas já lançadas para cada categoria — o teto de medição é sempre 100% (nunca mais que o valor orçado do item ou da categoria). Para lançar um novo avanço, use o formulário acima.</div>
      </div>
      <div class="legend">
        <span><span class="dot manual"></span>% lançado (quinzena)</span>
        <span><span class="dot auto"></span>% calculado pela soma dos itens (Detalhamento FC)</span>
      </div>
    </div>
    <div class="table-scroll"><table class="data">
      <thead><tr>
        <th>Nº</th><th class="wrap">Categoria</th><th class="num">Valor orçado</th>
        <th class="num">% itens (FC)</th><th class="num">% avanço efetivo</th><th>Progresso</th>
        <th class="num">Valor medido</th><th class="num">Saldo do contrato</th><th></th>
      </tr></thead>
      <tbody></tbody>
      <tfoot></tfoot>
    </table></div>
  `;
  root.appendChild(info);
  const tbody = info.querySelector('tbody');

  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${c.numero}`));
    tr.appendChild(td(`<span class="wrap">${esc(c.nome)}</span>`));
    tr.appendChild(td(`<span class="num">${money(c.valorOrcado)}</span>`));
    tr.appendChild(td(`<span class="num">${pct(c.percAvancoItens)}</span>`));

    const percTd = document.createElement('td');
    percTd.innerHTML = `<span class="num badge-cell ${c.origemPercAvanco === 'manual' ? 'manual' : 'auto'}">${pct(c.percAvancoEfetivo)}</span>`;
    tr.appendChild(percTd);

    const barTd = document.createElement('td');
    barTd.innerHTML = `<div class="progress-bar small"><span style="width:${Math.min(100, c.percAvancoEfetivo * 100)}%"></span></div>`;
    tr.appendChild(barTd);

    tr.appendChild(td(`<span class="num">${money(c.valorMedido)}</span>`));
    tr.appendChild(td(`<span class="num">${money(c.saldoContratoCategoria)}</span>`));

    const actionTd = document.createElement('td');
    if (c.origemPercAvanco === 'manual') {
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = 'usar % dos itens';
      btn.onclick = () => api('POST', `/api/categorias/${c.id}/avanco/limpar`);
      actionTd.appendChild(btn);
    }
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }

  const tfoot = info.querySelector('tfoot');
  const totalOrc = STATE.resumo.totalOrcadoCategorias;
  const totalMedido = STATE.resumo.totalMedido;
  tfoot.innerHTML = `<tr>
    <td colspan="2">TOTAL / % GERAL DA OBRA</td>
    <td class="num">${money(totalOrc)}</td>
    <td></td>
    <td class="num">${pct(STATE.resumo.percObraGeral)}</td>
    <td></td>
    <td class="num">${money(totalMedido)}</td>
    <td class="num">${money(totalOrc - totalMedido)}</td>
    <td></td>
  </tr>`;

  root.appendChild(renderHistoricoAvancosPanel());
}

// Histórico de avanços — tabela única editável com avanços PLANEJADO e
// REALIZADO lado a lado, filtro por quinzena igual ao Fluxo de Caixa (mesmo
// componente renderQuinzenaFilter). Edite % novo, data, status ou observação
// de qualquer linha, ou confirme um Planejado como Realizado quando o avanço
// acontecer de fato — só REALIZADO conta no % de avanço efetivo da
// categoria (ver recomputeCategoriaPercManual no servidor).
function renderHistoricoAvancosPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Histórico de avanços — planejados e realizados</h2>
        <div class="muted">Edite o % ou a data de qualquer avanço já lançado, ou confirme o status (Planejado → Realizado) quando o avanço acontecer de fato. Um avanço Planejado fica visível aqui, mas só entra no % efetivo da categoria depois de confirmado como Realizado. Filtre por quinzena para ver só aquele período.</div>
      </div>
      <button class="btn primary" id="btnNovoAvanco">+ Novo avanço</button>
    </div>
    <div class="quinzenaFilterSlot"></div>
    <div class="table-scroll"></div>
  `;
  const periods = buildQuinzenaPeriods(STATE.meta?.dataInicio, STATE.meta?.previsaoTermino);
  panel.querySelector('.quinzenaFilterSlot').appendChild(renderQuinzenaFilter({
    periods,
    selected: FILTRO_QUINZENA_AVANCOS,
    onChange: (v) => { FILTRO_QUINZENA_AVANCOS = v; renderAvancos(); },
  }));
  const wrap = panel.querySelector('.table-scroll');
  const entries = [...(STATE.historicoAvancos || [])]
    .filter((h) => dataNaQuinzena(h.data, FILTRO_QUINZENA_AVANCOS))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  if (!entries.length) {
    wrap.innerHTML = `<div class="muted">${FILTRO_QUINZENA_AVANCOS ? 'Nenhum avanço lançado nessa quinzena.' : 'Nenhum avanço lançado ainda.'}</div>`;
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'data';
    tbl.innerHTML = `<thead><tr>
      <th>Data</th><th class="wrap">Categoria</th><th class="num">% anterior</th><th class="num">% novo</th>
      <th>Status</th><th class="wrap">Observação</th><th></th>
    </tr></thead><tbody></tbody>`;
    const tbody = tbl.querySelector('tbody');
    for (const h of entries) {
      const tr = document.createElement('tr');
      tr.appendChild(td(dateInput({ value: h.data, onSave: (v) => api('PUT', `/api/historico-avancos/${h.id}`, { data: v }) })));
      tr.appendChild(td(`<span class="wrap">${esc(h.categoriaNome)}</span>`));
      tr.appendChild(td(`<span class="num">${h.percAvancoAnterior == null ? '—' : pct(h.percAvancoAnterior)}</span>`));
      tr.appendChild(td(percentInput({ value: h.percAvancoNovo, onSave: (v) => api('PUT', `/api/historico-avancos/${h.id}`, { percAvancoNovo: v }) })));
      tr.appendChild(td(selectInput({
        value: h.status || 'REALIZADO',
        options: ['PLANEJADO', 'REALIZADO'],
        onSave: (v) => api('PUT', `/api/historico-avancos/${h.id}`, { status: v }),
      })));
      tr.appendChild(td(textInput({ value: h.obs, wide: true, onSave: (v) => api('PUT', `/api/historico-avancos/${h.id}`, { obs: v }) })));
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.onclick = () => { if (confirm(`Remover avanço de "${h.categoriaNome}"?`)) api('DELETE', `/api/historico-avancos/${h.id}`); };
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    }
    wrap.appendChild(tbl);
  }
  panel.querySelector('#btnNovoAvanco').onclick = () => openNovoAvancoModal();
  return panel;
}

function openNovoAvancoModal() {
  openModal('Novo avanço', (body, close) => {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <label style="grid-column: 1 / -1">Categoria
        <select name="categoriaId" required>${STATE.categorias.map((c) => `<option value="${c.id}">${c.numero}. ${esc(c.nome)}</option>`).join('')}</select>
      </label>
      <label>% novo acumulado<input name="percAvancoNovo" type="number" step="0.1" min="0" max="100" required /></label>
      <label>Data<input name="data" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Status
        <select name="status"><option value="PLANEJADO">Planejado</option><option value="REALIZADO" selected>Realizado</option></select>
      </label>
      <label style="grid-column: 1 / -1">Observação<input name="obs" /></label>
      <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn" id="cancelBtn">Cancelar</button>
        <button type="submit" class="btn primary">Adicionar</button>
      </div>
    `;
    form.querySelector('#cancelBtn').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.percAvancoNovo = Number(payload.percAvancoNovo) / 100;
      await api('POST', '/api/historico-avancos', payload);
      close();
    });
    body.appendChild(form);
  });
}

/* ==========================================================================
   TAB — Cronograma de Obra (previsto x realizado)
   ========================================================================== */
const STATUS_CRONOGRAMA_INFO = {
  'concluido': { label: 'Concluído', badge: 'green' },
  'no-prazo': { label: 'No prazo', badge: 'blue' },
  'atrasado': { label: 'Atrasado', badge: 'red' },
  'sem-dados': { label: 'Sem cronograma', badge: 'gray' },
};

function renderCronograma() {
  const root = document.getElementById('tab-cronograma');
  root.innerHTML = '';
  const r = STATE.resumo;

  // Escala do timeline geral (do início da obra ao término previsto) usada para
  // posicionar as barras de cada categoria proporcionalmente às suas datas.
  const projInicio = new Date((STATE.meta?.dataInicio || '2026-05-11') + 'T00:00:00');
  const projTermino = new Date((STATE.meta?.previsaoTermino || '2027-08-14') + 'T00:00:00');
  const projTotalMs = Math.max(1, projTermino.getTime() - projInicio.getTime());
  const hojeDate = new Date((r.dataReferenciaCronograma || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  const hojePerc = clampPerc((hojeDate.getTime() - projInicio.getTime()) / projTotalMs);

  const diasDecorridos = Math.round((hojeDate.getTime() - projInicio.getTime()) / 86400000);
  const diasTotais = Math.round(projTotalMs / 86400000);

  // Etapa PCI corrente (onde o % de obra geral está posicionado agora) — liga o
  // avanço físico do cronograma à liberação de caixa correspondente.
  const etapaAtual = (STATE.liberacaoPCI || []).find((e) => r.percObraGeral < e.percLimiteAcumulado)
    || STATE.liberacaoPCI[STATE.liberacaoPCI.length - 1];

  const cards = document.createElement('div');
  cards.className = 'cards-grid';
  cards.innerHTML = `
    <div class="card accent">
      <div class="card-label">% Executado (real)</div>
      <div class="card-value">${pct(r.percObraGeral)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percObraGeral * 100)}%"></span></div>
      <div class="card-sub">Medido: ${money(r.totalMedido)} de ${money(r.totalOrcadoCategorias)}</div>
    </div>
    <div class="card ${r.percObraGeral + 0.0001 >= r.percPrevistoGeral ? 'good' : 'warn'}">
      <div class="card-label">% Previsto (cronograma)</div>
      <div class="card-value">${pct(r.percPrevistoGeral)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percPrevistoGeral * 100)}%"></span></div>
      <div class="card-sub">${r.percObraGeral + 0.0001 >= r.percPrevistoGeral ? 'Obra no prazo ou adiantada' : `Obra atrasada em ${pct(r.percPrevistoGeral - r.percObraGeral)} vs. planejado`}</div>
    </div>
    <div class="card">
      <div class="card-label">Prazo decorrido</div>
      <div class="card-value">${diasDecorridos} / ${diasTotais} dias</div>
      <div class="card-sub">Início: ${dateBR(STATE.meta?.dataInicio)} · Término previsto: ${dateBR(STATE.meta?.previsaoTermino)}</div>
    </div>
    <div class="card">
      <div class="card-label">Etapa PCI corrente</div>
      <div class="card-value">${etapaAtual ? `${etapaAtual.etapa} — ${esc(etapaAtual.descricao)}` : '—'}</div>
      <div class="card-sub">${etapaAtual ? `Libera a ${pct(etapaAtual.percLimiteAcumulado)} de obra executada · ${money(etapaAtual.valor)}` : ''}</div>
    </div>
  `;
  root.appendChild(cards);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Cronograma físico — previsto × realizado</h2>
        <div class="muted">Datas previstas extraídas da planilha original (aba Cronograma de obra). O % realizado é o mesmo lançado na aba "Lançar Avanços" — edite aqui também. A barra clara mostra a janela planejada; a barra colorida mostra o quanto já foi executado; a linha âmbar marca a data de hoje (${dateBR(r.dataReferenciaCronograma)}). Filtre por quinzena para ver só as categorias cujo último avanço foi lançado naquele período.</div>
      </div>
      <div class="gantt-legend">
        <span><span class="dot" style="background:#d7deec"></span>Janela planejada</span>
        <span><span class="dot" style="background:var(--primary)"></span>Executado — no prazo</span>
        <span><span class="dot" style="background:var(--red)"></span>Executado — atrasado</span>
        <span><span class="dot" style="background:var(--green)"></span>Concluído</span>
        <span><span class="dot" style="background:var(--amber)"></span>Hoje</span>
      </div>
    </div>
    <div class="quinzenaFilterSlot"></div>
    <div class="table-scroll"><table class="data">
      <thead><tr>
        <th>Nº</th><th class="wrap">Categoria</th><th>Início prev.</th><th>Término prev.</th>
        <th class="num">Dur. (d)</th><th class="num">% Previsto</th><th class="num">% Realizado</th>
        <th>Status</th><th style="min-width:240px">Linha do tempo</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>
  `;
  root.appendChild(panel);

  const periods = buildQuinzenaPeriods(STATE.meta?.dataInicio, STATE.meta?.previsaoTermino);
  panel.querySelector('.quinzenaFilterSlot').appendChild(renderQuinzenaFilter({
    periods,
    selected: FILTRO_QUINZENA_CRONOGRAMA,
    onChange: (v) => { FILTRO_QUINZENA_CRONOGRAMA = v; renderCronograma(); },
  }));

  const tbody = panel.querySelector('tbody');
  const categoriasFiltradas = STATE.categorias.filter((c) => dataNaQuinzena(c.dataUltimoAvanco, FILTRO_QUINZENA_CRONOGRAMA));
  if (!categoriasFiltradas.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted">Nenhuma categoria com avanço lançado nessa quinzena.</td></tr>';
  }
  for (const c of categoriasFiltradas) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${c.numero}`));
    tr.appendChild(td(`<span class="wrap">${esc(c.nome)}</span>`));
    tr.appendChild(td(c.cronogramaPrevisto ? dateBR(c.cronogramaPrevisto.inicio) : '—'));
    tr.appendChild(td(c.cronogramaPrevisto ? dateBR(c.cronogramaPrevisto.termino) : '—'));
    tr.appendChild(td(`<span class="num">${c.cronogramaPrevisto ? c.cronogramaPrevisto.duracaoDias : '—'}</span>`));
    tr.appendChild(td(`<span class="num">${pct(c.percPrevisto)}</span>`));

    tr.appendChild(td(`<span class="num badge-cell ${c.origemPercAvanco === 'manual' ? 'manual' : 'auto'}">${pct(c.percAvancoEfetivo)}</span>`));

    const info = STATUS_CRONOGRAMA_INFO[c.statusCronograma] || STATUS_CRONOGRAMA_INFO['sem-dados'];
    tr.appendChild(td(`<span class="badge ${info.badge}">${info.label}</span>`));

    const ganttTd = document.createElement('td');
    if (c.cronogramaPrevisto) {
      const ini = new Date(c.cronogramaPrevisto.inicio + 'T00:00:00');
      const fim = new Date(c.cronogramaPrevisto.termino + 'T00:00:00');
      const barStart = clampPerc((ini.getTime() - projInicio.getTime()) / projTotalMs);
      const barEnd = clampPerc((fim.getTime() - projInicio.getTime()) / projTotalMs);
      const barWidth = Math.max(0.6, (barEnd - barStart) * 100);
      const actualWidth = Math.min(100, c.percAvancoEfetivo * 100);
      const statusClass = c.statusCronograma === 'atrasado' ? 'status-atrasado' : c.statusCronograma === 'concluido' ? 'status-concluido' : '';
      ganttTd.innerHTML = `
        <div class="gantt-track">
          <div class="gantt-planned" style="left:${barStart * 100}%; width:${barWidth}%"></div>
          <div class="gantt-actual ${statusClass}" style="left:${barStart * 100}%; width:${(barWidth * actualWidth) / 100}%"></div>
          <div class="gantt-hoje" style="left:${hojePerc * 100}%"></div>
        </div>`;
    } else {
      ganttTd.innerHTML = '<span class="muted">Sem datas na planilha</span>';
    }
    tr.appendChild(ganttTd);
    tbody.appendChild(tr);
  }
}

function clampPerc(v) {
  return Math.max(0, Math.min(1, v));
}

/* ==========================================================================
   TAB 3 — Detalhamento FC (itens por categoria)
   ========================================================================== */
// Gasto no cartão por mês/quinzena — mesma fonte e agrupamento do campo
// "Cartão" em Contas a Pagar (parcela.gastoCartao + mesReferenciaLabel), não
// recalculado a partir dos itens: garante que bate exatamente com o extrato
// do cartão (fechamento dia 05, sempre lançado na 1ª quinzena do mês — por
// isso toda linha "2º PARCELA" aparece com R$ 0,00, igual à fatura real).
function renderGastoCartaoMensal() {
  const rows = [...STATE.parcelas]
    .filter((p) => p.mesReferenciaLabel)
    .sort((a, b) => (a.vencimento || a.vencPlanejado || '').localeCompare(b.vencimento || b.vencPlanejado || ''));
  const totalGeral = rows.reduce((a, p) => a + (Number(p.gastoCartao) || 0), 0);
  const details = document.createElement('details');
  details.className = 'scurve-table-details';
  details.innerHTML = `<summary>Ver gasto no cartão por quinzena (${money(totalGeral)} no total)</summary>`;
  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  if (!rows.length) {
    wrap.innerHTML = '<div class="muted" style="padding:8px 0">Nenhuma parcela lançada ainda.</div>';
  } else {
    wrap.innerHTML = `<table class="data"><thead><tr><th>Mês</th><th class="num">Gasto do cartão</th></tr></thead><tbody>${rows.map((p) => `
      <tr><td>${esc(p.mesReferenciaLabel)}</td><td class="num">${money(p.gastoCartao)}</td></tr>
    `).join('')}</tbody></table>`;
  }
  details.appendChild(wrap);
  return details;
}

function renderDetalhamento() {
  const root = document.getElementById('tab-detalhamento');
  root.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'panel';
  header.innerHTML = `<div class="panel-header">
    <div>
      <h2>Detalhamento FC — orçado x realizado por item</h2>
      <div class="muted">Cada categoria soma seus itens automaticamente. Edite valores realizados, orçados, datas e forma de pagamento; adicione ou remova itens conforme o lançamento real. Itens individuais podem custar mais que o orçado inicial (estouros reais); o teto de 100% vale só para a categoria como um todo.</div>
    </div>
  </div>`;
  header.appendChild(renderGastoCartaoMensal());
  root.appendChild(header);

  for (const c of STATE.categorias) {
    const block = document.createElement('div');
    block.className = `category-block${OPEN_CATEGORIES.has(c.id) ? ' open' : ''}`;

    const head = document.createElement('div');
    head.className = 'category-head';
    head.innerHTML = `
      <span class="name">${c.numero}. ${esc(c.nome)}</span>
      <span class="stats">
        <span>Orçado: <strong>${money(c.valorOrcado)}</strong></span>
        <span>Realizado: <strong>${money(c.valorRealizadoItens)}</strong></span>
        <span class="badge ${c.percAvancoItens >= 1 ? 'green' : c.percAvancoItens > 0 ? 'blue' : 'gray'}">${pct(c.percAvancoItens)}</span>
      </span>
    `;
    head.onclick = () => {
      if (OPEN_CATEGORIES.has(c.id)) OPEN_CATEGORIES.delete(c.id); else OPEN_CATEGORIES.add(c.id);
      renderDetalhamento();
    };
    block.appendChild(head);

    const body = document.createElement('div');
    body.className = 'category-body';
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-scroll';
    tableWrap.innerHTML = `<table class="data"><thead><tr>
      <th class="wrap">Descrição</th><th>Unid.</th><th class="num">Orçado (R$)</th><th class="num">Realizado (R$)</th>
      <th>Data pagto.</th><th>Forma pgto.</th><th></th>
    </tr></thead><tbody></tbody></table>`;
    const tbody = tableWrap.querySelector('tbody');

    for (const it of c.itens) {
      const tr = document.createElement('tr');
      tr.appendChild(td(textInput({ value: it.descricao, wide: true, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { descricao: v }) })));
      tr.appendChild(td(textInput({ value: it.unidade, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { unidade: v }) })));
      tr.appendChild(td(numberInput({ value: it.valorOrcado, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { valorOrcado: v }) })));
      const realizadoCell = document.createElement('td');
      realizadoCell.appendChild(numberInput({ value: it.valorRealizado, manual: true, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { valorRealizado: v }) }));
      if (it.valorRealizadoOriginal !== undefined) {
        const warn = document.createElement('span');
        warn.className = 'badge amber';
        warn.style.display = 'block';
        warn.style.marginTop = '4px';
        warn.style.width = 'max-content';
        warn.textContent = 'ajustado p/ caber no orçado';
        warn.title = `Valor lançado: ${money(it.valorRealizadoOriginal)}. Reduzido automaticamente para ${money(it.valorRealizado)} porque os demais itens desta categoria já somam o restante do orçado — o total da categoria nunca ultrapassa o valor orçado.`;
        realizadoCell.appendChild(warn);
      }
      tr.appendChild(realizadoCell);
      tr.appendChild(td(dateInput({ value: it.dataPagamento, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { dataPagamento: v }) })));
      tr.appendChild(td(selectInput({ value: it.formaPagamento || 'PIX', options: ['PIX', 'CARTÃO', 'DINHEIRO', 'TRANSFERÊNCIA', 'OUTRO'], onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { formaPagamento: v }) })));
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.onclick = () => { if (confirm('Remover este item?')) api('DELETE', `/api/categorias/${c.id}/itens/${it.id}`); };
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    }
    body.appendChild(tableWrap);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn small';
    addBtn.style.marginTop = '10px';
    addBtn.textContent = '+ Adicionar item';
    addBtn.onclick = () => api('POST', `/api/categorias/${c.id}/itens`, { descricao: 'Novo item', unidade: '', valorOrcado: 0, valorRealizado: 0 })
      .then(() => OPEN_CATEGORIES.add(c.id));
    body.appendChild(addBtn);

    const parceladaBtn = document.createElement('button');
    parceladaBtn.className = 'btn small';
    parceladaBtn.style.marginTop = '10px';
    parceladaBtn.style.marginLeft = '8px';
    parceladaBtn.textContent = '💳 Lançar compra parcelada no cartão';
    parceladaBtn.onclick = () => openCompraParceladaModal(c);
    body.appendChild(parceladaBtn);

    block.appendChild(body);
    root.appendChild(block);
  }
}

// Lança uma compra no cartão (parcelada ou à vista): cria os itens no
// Detalhamento FC da categoria e soma automaticamente cada parcela na
// parcela de Contas a Pagar do mês da fatura correspondente (cria a parcela se
// ainda não existir) — sem precisar editar o cartão manualmente depois.
function openCompraParceladaModal(categoria) {
  openModal(`Compra parcelada no cartão — ${categoria.nome}`, (body, close) => {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <label style="grid-column: 1 / -1">Descrição da compra
        <input name="descricao" placeholder="Ex.: Madeira para formas" required />
      </label>
      <label>Valor total (R$)
        <input name="valorTotal" type="number" step="0.01" min="0.01" required />
      </label>
      <label>Quantidade de parcelas
        <input name="qtdParcelas" type="number" step="1" min="1" value="1" />
      </label>
      <label>Data da compra
        <input name="dataCompra" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </label>
      <label>Mês da 1ª fatura (as demais seguem mês a mês)
        <input name="primeiraFatura" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </label>
      <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn" id="cancelBtn">Cancelar</button>
        <button type="submit" class="btn primary">Lançar</button>
      </div>
    `;
    form.querySelector('#cancelBtn').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const data = await api('POST', `/api/categorias/${categoria.id}/compra-parcelada`, payload);
      close();
      OPEN_CATEGORIES.add(categoria.id);
      renderAll();
      const cp = data.compraParcelada;
      if (cp) {
        toast(`Lançado: ${money(cp.valorTotal)} em ${cp.qtdParcelas}x, somado ao cartão de ${cp.parcelasAfetadas.map((p) => p.label).join(', ')}.`);
      }
    });
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.style.marginBottom = '8px';
    hint.textContent = 'O valor total é dividido igualmente entre as parcelas (a última absorve o arredondamento). Cada parcela vira um item no Detalhamento FC e soma automaticamente no cartão da parcela de Contas a Pagar do respectivo mês/quinzena (criando a parcela se ainda não existir).';
    body.appendChild(hint);
    body.appendChild(form);
  });
}

/* ==========================================================================
   Lançar avanço da quinzena (aba "Lançar Avanços"): igual à planilha original
   — 2 lançamentos por mês, cada um define o % acumulado de cada categoria que
   avançou naquela quinzena e já gera a parcela correspondente em Contas a
   Pagar. Cartão é sempre 1ª quinzena (fechamento dia 05, vencimento dia 15).
   ========================================================================== */
function renderLancamentoQuinzenaPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Lançar avanço da quinzena</h2>
        <div class="muted">Escolha a quinzena (mês/1ª ou 2ª parcela) e informe o novo % acumulado de cada categoria que avançou — o valor orçado de cada categoria rateia o valor gerado. O sistema desconta o cartão (já lançado no Detalhamento FC), sugere o PIX ao empreiteiro e à administração, e gera automaticamente a parcela em Contas a Pagar para essa quinzena exata.</div>
      </div>
    </div>
  `;

  const periods = buildQuinzenaPeriods(STATE.meta?.dataInicio, STATE.meta?.previsaoTermino);
  const hoje = STATE.resumo.dataReferenciaCronograma || new Date().toISOString().slice(0, 10);
  const periodoAtual = periodoFromDateStr(hoje);
  const defaultIdx = Math.max(0, periods.findIndex((p) => p.mes === periodoAtual?.mes && p.quinzena === periodoAtual?.quinzena));

  const periodoRow = document.createElement('div');
  periodoRow.className = 'form-grid';
  periodoRow.innerHTML = `
    <label>Quinzena
      <select id="lqPeriodo">${periods.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('')}</select>
    </label>
    <label>Status
      <select id="lqStatus"><option value="PLANEJADO">PLANEJADO</option><option value="REALIZADO">REALIZADO</option></select>
    </label>
    <label>Data em que o custo foi gerado
      <input id="lqDataCusto" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    </label>
    <label>Gasto no cartão nesta quinzena (R$)
      <input id="lqCartao" type="number" step="0.01" value="0" />
    </label>
  `;
  periodoRow.querySelector('#lqPeriodo').value = String(defaultIdx);
  panel.appendChild(periodoRow);

  const body = document.createElement('div');
  body.className = 'table-scroll';
  body.innerHTML = `<table class="data">
    <thead><tr>
      <th>Nº</th><th class="wrap">Categoria</th><th class="num">Peso</th><th class="num">Valor orçado</th>
      <th class="num">% atual (acumulado)</th><th class="num">Novo % acumulado</th><th class="num">Valor gerado</th>
    </tr></thead>
    <tbody></tbody>
  </table>`;
  const tbody = body.querySelector('tbody');

  const rows = [];
  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${c.numero}`));
    tr.appendChild(td(`<span class="wrap">${esc(c.nome)}</span>`));
    tr.appendChild(td(`<span class="num">${pct(c.peso)}</span>`));
    tr.appendChild(td(`<span class="num">${money(c.valorOrcado)}</span>`));
    tr.appendChild(td(`<span class="num">${pct(c.percAvancoEfetivo)}</span>`));

    const percAtual = Math.round(c.percAvancoEfetivo * 1000) / 10;
    const novoPercInput = document.createElement('input');
    novoPercInput.type = 'number'; novoPercInput.step = '0.1'; novoPercInput.min = '0'; novoPercInput.max = '100';
    novoPercInput.className = 'cell-input';
    novoPercInput.value = percAtual;
    novoPercInput.title = 'Teto de medição: nunca mais que 100%.';
    tr.appendChild(td(novoPercInput));

    const valorGeradoCell = document.createElement('td');
    valorGeradoCell.className = 'num';
    valorGeradoCell.textContent = money(0);
    tr.appendChild(valorGeradoCell);

    tbody.appendChild(tr);
    rows.push({ categoria: c, percAtual, novoPercInput, valorGeradoCell });
  }
  panel.appendChild(body);

  const totals = document.createElement('div');
  totals.className = 'cards-grid';
  totals.style.marginTop = '4px';
  totals.innerHTML = `
    <div class="card"><div class="card-label">Valor gerado na quinzena</div><div class="card-value" id="lqValorGerado">${money(0)}</div></div>
    <div class="card"><div class="card-label">Sugestão empreiteiro (PIX)</div><div class="card-value" id="lqEmpreiteiro">${money(0)}</div></div>
    <div class="card"><div class="card-label">Sugestão administração (PIX)</div><div class="card-value" id="lqAdm">${money(0)}</div></div>
  `;
  panel.appendChild(totals);

  const obsRow = document.createElement('div');
  obsRow.className = 'form-grid';
  obsRow.style.marginTop = '4px';
  obsRow.innerHTML = `<label style="grid-column: 1 / -1">Observação<textarea id="lqObs"></textarea></label>`;
  panel.appendChild(obsRow);

  const cartaoInput = periodoRow.querySelector('#lqCartao');

  function quinzenaAtual() { return periods[Number(periodoRow.querySelector('#lqPeriodo').value)]; }

  async function atualizarSugestaoCartao() {
    const p = quinzenaAtual();
    if (!p) return;
    if (p.quinzena === 2) {
      cartaoInput.value = '0';
      cartaoInput.disabled = true;
      cartaoInput.title = 'Cartão é sempre pago na 1ª quinzena do mês — nunca na 2ª.';
    } else {
      cartaoInput.disabled = false;
      cartaoInput.title = '';
      try {
        const res = await fetch(`/api/sugestao-cartao/${p.mes}`);
        const data = await res.json();
        cartaoInput.value = data.gastoCartao || 0;
      } catch { /* mantém o que já estava digitado */ }
    }
    recalcPreview();
  }

  function recalcPreview() {
    let valorGeradoPeriodo = 0;
    for (const r of rows) {
      const novoPerc = Math.min(100, Math.max(0, Number(r.novoPercInput.value) || 0));
      const deltaValor = r.categoria.valorOrcado * ((novoPerc - r.percAtual) / 100);
      r.valorGeradoCell.textContent = money(deltaValor);
      r.valorGeradoCell.style.color = deltaValor > 0.004 ? 'var(--good, var(--green))' : deltaValor < -0.004 ? 'var(--danger, var(--red))' : '';
      valorGeradoPeriodo += deltaValor;
    }
    const gastoCartao = Number(cartaoInput.value) || 0;
    const taxaAdm = STATE.parametros.taxaAdministracaoPercent || 0;
    const empreiteiro = Math.max(0, valorGeradoPeriodo - gastoCartao);
    const adm = (empreiteiro + gastoCartao) * taxaAdm;
    panel.querySelector('#lqValorGerado').textContent = money(valorGeradoPeriodo);
    panel.querySelector('#lqEmpreiteiro').textContent = money(empreiteiro);
    panel.querySelector('#lqAdm').textContent = money(adm);
  }
  rows.forEach((r) => r.novoPercInput.addEventListener('input', recalcPreview));
  cartaoInput.addEventListener('input', recalcPreview);
  periodoRow.querySelector('#lqPeriodo').addEventListener('change', atualizarSugestaoCartao);
  atualizarSugestaoCartao();

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; justify-content:flex-end; margin-top:12px;';
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn primary';
  submitBtn.textContent = 'Lançar avanço e gerar parcela';
  submitBtn.onclick = async () => {
    const avancos = rows
      .filter((r) => Math.abs(Number(r.novoPercInput.value) - r.percAtual) > 0.001)
      .map((r) => ({ categoriaId: r.categoria.id, novoPerc: Math.min(1, Math.max(0, Number(r.novoPercInput.value) / 100)) }));
    if (!avancos.length) { toast('Altere o % de ao menos uma categoria.', true); return; }
    const p = quinzenaAtual();
    const payload = {
      mes: p.mes,
      quinzena: p.quinzena,
      avancos,
      gastoCartao: Number(cartaoInput.value) || 0,
      dataGeracaoCusto: periodoRow.querySelector('#lqDataCusto').value || null,
      status: periodoRow.querySelector('#lqStatus').value,
      obs: obsRow.querySelector('#lqObs').value,
    };
    try {
      const data = await api('POST', '/api/lancamento-quinzena', payload);
      if (!toastAjuste(data)) toast(`Avanço lançado — parcela "${p.label}" atualizada em Contas a Pagar.`);
    } catch (e) { /* erro já mostrado pelo api() */ }
  };
  actions.appendChild(submitBtn);
  panel.appendChild(actions);

  return panel;
}

// Painel compacto no Fluxo de Caixa: por categoria, o que será pago ao
// empreiteiro (contrato) lado a lado com o que será liberado pela CAIXA
// (verba específica de cada categoria) — mesmas 20 linhas, duas fontes de
// dinheiro diferentes (ver "Liberação por categoria" na aba Liberação PCI
// para editar/ajustar valores manuais).
function renderLiberacaoPorCategoriaResumo() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>O que pagar x o que liberar, por categoria</h2>
        <div class="muted">Empreiteiro (PIX, contrato) é pago por quinzena; CAIXA (crédito PCI) é liberado mensalmente. Cada categoria tem sua própria verba nas duas fontes. Para ajustar liberação manual, use a aba Liberação PCI.</div>
      </div>
    </div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Nº</th><th class="wrap">Categoria</th><th class="num">% avanço</th>
      <th class="num">Orçado empreiteiro</th><th class="num">Medido/pago empreiteiro</th><th class="num">Saldo empreiteiro</th>
      <th class="num">Verba CAIXA</th><th class="num">Liberado CAIXA</th><th class="num">Saldo CAIXA</th>
    </tr></thead><tbody></tbody>
    <tfoot></tfoot></table></div>
  `;
  const tbody = panel.querySelector('tbody');
  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.numero}</td>
      <td class="wrap">${esc(c.nome)}</td>
      <td class="num">${pct(c.percAvancoEfetivo)}</td>
      <td class="num">${money(c.valorOrcado)}</td>
      <td class="num">${money(c.valorMedido)}</td>
      <td class="num">${money(c.saldoContratoCategoria)}</td>
      <td class="num">${money(c.verbaCaixa)}</td>
      <td class="num">${money(c.caixaLiberadoCategoria)}</td>
      <td class="num">${money(c.saldoCaixaCategoria)}</td>
    `;
    tbody.appendChild(tr);
  }
  const r = STATE.resumo;
  panel.querySelector('tfoot').innerHTML = `<tr>
    <td colspan="3">TOTAL</td>
    <td class="num">${money(r.totalOrcadoCategorias)}</td>
    <td class="num">${money(r.totalMedido)}</td>
    <td class="num">${money(r.totalOrcadoCategorias - r.totalMedido)}</td>
    <td class="num">${money(r.totalVerbaCaixaCategorias)}</td>
    <td class="num">${money(r.totalCaixaLiberadoCategorias)}</td>
    <td class="num">${money(r.totalVerbaCaixaCategorias - r.totalCaixaLiberadoCategorias)}</td>
  </tr>`;
  return panel;
}

function renderFluxo() {
  const root = document.getElementById('tab-fluxo');
  root.innerHTML = '';

  const r = STATE.resumo;
  const tracking = document.createElement('div');
  tracking.className = 'cards-grid';
  tracking.innerHTML = `
    <div class="card good">
      <div class="card-label">Avanço empreiteiro (% pago)</div>
      <div class="card-value">${pct(r.percValorTotalPago)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percValorTotalPago * 100)}%"></span></div>
      <div class="card-sub">Saldo empreiteiro (falta do contrato): ${money(r.saldoContratoAPagarEmpreiteiro)}</div>
    </div>
    <div class="card accent">
      <div class="card-label">Avanço caixa (% liberado)</div>
      <div class="card-value">${pct(r.percCaixaLiberada)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percCaixaLiberada * 100)}%"></span></div>
      <div class="card-sub">Crédito CAIXA ainda a liberar: ${money(r.saldoCaixaDisponivel)}</div>
    </div>
  `;
  root.appendChild(tracking);
  root.appendChild(renderVerbaFuturaBlock());

  root.appendChild(renderLiberacaoPorCategoriaResumo());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Fluxo de caixa por mês e parcela</h2>
        <div class="muted">Organizado como em Contas a Pagar — cada mês dividido em 1º e 2º Parcela, na ordem cronológica correta. Agregado a partir de todas as parcelas lançadas (planejadas e realizadas) mais ajustes manuais. A liberação de caixa (PCI) aparece no mês originalmente programado de cada etapa. As colunas "Entrada/Saída Realizada" e "Planejada" mostram, dentro do total de cada quinzena, quanto já foi confirmado (status Realizado nas parcelas/liberações) e quanto ainda é planejamento. Para o saldo já efetivamente realizado, veja os cards do Dashboard. Filtre por quinzena para ver só aquele período.</div>
      </div>
      <button class="btn primary" id="btnNovoAjuste">+ Ajuste manual</button>
    </div>
    <div class="quinzenaFilterSlot"></div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Mês / Parcela</th><th class="num">Entrada recurso próprio</th><th class="num">Entrada caixa (PCI)</th><th class="num">Entrada ajuste</th><th class="num">Entrada total</th>
      <th class="num">Entrada Realizada</th><th class="num">Entrada Planejada</th>
      <th class="num">Saída empreiteiro (PIX)</th><th class="num">Saída ADM (PIX)</th>
      <th class="num">Saída cartão</th><th class="num">Saída ajuste</th><th class="num">Saída total</th>
      <th class="num">Saída Realizada</th><th class="num">Saída Planejada</th><th class="num">Saldo acumulado</th>
    </tr></thead><tbody></tbody></table></div>
  `;
  root.appendChild(panel);

  const periodsFluxo = buildQuinzenaPeriods(STATE.meta?.dataInicio, STATE.meta?.previsaoTermino);
  panel.querySelector('.quinzenaFilterSlot').appendChild(renderQuinzenaFilter({
    periods: periodsFluxo,
    selected: FILTRO_QUINZENA_FLUXO,
    onChange: (v) => { FILTRO_QUINZENA_FLUXO = v; renderFluxo(); },
  }));

  const tbody = panel.querySelector('tbody');
  const mesesFiltrados = STATE.fluxoCaixaMensal.filter((m) => !FILTRO_QUINZENA_FLUXO || (m.mes === FILTRO_QUINZENA_FLUXO.mes && m.quinzena === FILTRO_QUINZENA_FLUXO.quinzena));
  for (const m of mesesFiltrados) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(m.label)}</td>
      <td class="num">${money(m.entradaRecursoProprio)}</td>
      <td class="num">${money(m.entradaCaixaPCI)}</td>
      <td class="num">${money(m.entradaAjusteManual)}</td>
      <td class="num" style="font-weight:700">${money(m.entradaTotal)}</td>
      <td class="num" style="color:var(--green)">${money(m.entradaRealizada)}</td>
      <td class="num" style="color:var(--amber)">${money(m.entradaPlanejada)}</td>
      <td class="num">${money(m.saidaEmpreiteiroPix)}</td>
      <td class="num">${money(m.saidaAdmPix)}</td>
      <td class="num">${money(m.saidaCartao)}</td>
      <td class="num">${money(m.saidaAjusteManual)}</td>
      <td class="num" style="font-weight:700">${money(m.saidaTotal)}</td>
      <td class="num" style="color:var(--green)">${money(m.saidaRealizada)}</td>
      <td class="num" style="color:var(--amber)">${money(m.saidaPlanejada)}</td>
      <td class="num" style="font-weight:700; color:${m.saldoAcumuladoMes < 0 ? 'var(--red)' : 'var(--green)'}">${money(m.saldoAcumuladoMes)}</td>
    `;
    tbody.appendChild(tr);
  }
  if (!mesesFiltrados.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="muted">${FILTRO_QUINZENA_FLUXO ? 'Nenhum lançamento nessa quinzena.' : 'Nenhuma parcela lançada ainda.'}</td></tr>`;
  }

  const ajustesPanel = document.createElement('div');
  ajustesPanel.className = 'panel';
  ajustesPanel.innerHTML = `<div class="panel-header"><h2>Ajustes manuais lançados</h2></div>`;
  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  if (!STATE.fluxoCaixaAjustes.length) {
    wrap.innerHTML = '<div class="muted">Nenhum ajuste manual lançado.</div>';
  } else {
    wrap.innerHTML = `<table class="data"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Valor</th><th class="wrap">Descrição</th><th></th></tr></thead>
      <tbody>${STATE.fluxoCaixaAjustes.map((a) => `
        <tr>
          <td>${dateBR(a.data)}</td>
          <td><span class="badge ${a.tipo === 'entrada' ? 'green' : 'red'}">${a.tipo}</span></td>
          <td class="num">${money(a.valor)}</td>
          <td class="wrap">${esc(a.descricao)}</td>
          <td><button class="icon-btn" data-del="${a.id}">🗑</button></td>
        </tr>`).join('')}</tbody></table>`;
  }
  ajustesPanel.appendChild(wrap);
  ajustesPanel.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = () => api('DELETE', `/api/fluxo-caixa-ajustes/${btn.dataset.del}`);
  });
  root.appendChild(ajustesPanel);

  document.getElementById('btnNovoAjuste').onclick = () => openNovoAjusteModal();
}

function openNovoAjusteModal() {
  openModal('Novo ajuste manual no fluxo de caixa', (body, close) => {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <label>Data<input name="data" type="date" required /></label>
      <label>Tipo
        <select name="tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select>
      </label>
      <label>Valor<input name="valor" type="number" step="0.01" required /></label>
      <label style="grid-column: 1 / -1">Descrição<textarea name="descricao"></textarea></label>
      <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn" id="cancelBtn">Cancelar</button>
        <button type="submit" class="btn primary">Adicionar</button>
      </div>
    `;
    form.querySelector('#cancelBtn').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      await api('POST', '/api/fluxo-caixa-ajustes', payload);
      close();
    });
    body.appendChild(form);
  });
}

/* ==========================================================================
   TAB 5 — Liberação PCI
   ========================================================================== */
function renderPCI() {
  const root = document.getElementById('tab-pci');
  root.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Liberação PCI — cronograma macro planejado do financiamento CAIXA</h2>
        <div class="muted">Planejamento das 6 grandes etapas (soma o crédito CAIXA total de R$ 1.500.000,00) — não é a fonte do "quanto já foi liberado" (o banco libera por medição mensal própria, sem seguir esse cronograma por % de obra; veja "Liberações reais do CAIXA" abaixo).</div>
      </div>
    </div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Etapa</th><th class="wrap">Descrição</th><th class="num">% limite acumulado</th><th class="num">Valor da etapa</th>
      <th class="num">Mês programado</th>
    </tr></thead><tbody></tbody>
    <tfoot></tfoot></table></div>
  `;
  root.appendChild(panel);
  const tbody = panel.querySelector('tbody');
  for (const e of STATE.liberacaoPCI) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${e.etapa}`));
    tr.appendChild(td(textInput({ value: e.descricao, wide: true, onSave: (v) => api('PUT', `/api/liberacao-pci/${e.etapa}`, { descricao: v }) })));
    tr.appendChild(td(numberInput({ value: Math.round(e.percLimiteAcumulado * 1000) / 10, step: '0.1', onSave: (v) => api('PUT', `/api/liberacao-pci/${e.etapa}`, { percLimiteAcumulado: v / 100 }) })));
    tr.appendChild(td(numberInput({ value: e.valor, onSave: (v) => api('PUT', `/api/liberacao-pci/${e.etapa}`, { valor: v }) })));
    tr.appendChild(td(numberInput({ value: e.mesProgramado, step: '1', onSave: (v) => api('PUT', `/api/liberacao-pci/${e.etapa}`, { mesProgramado: v }) })));
    tbody.appendChild(tr);
  }
  const tfoot = panel.querySelector('tfoot');
  tfoot.innerHTML = `<tr>
    <td colspan="3">TOTAL</td>
    <td class="num">${money(STATE.resumo.creditoCaixaTotalPCI)}</td>
    <td></td>
  </tr>`;

  root.appendChild(renderLiberacoesCaixaPanel());
  root.appendChild(renderLiberacaoPorCategoria());
}

// Liberações reais do CAIXA: cada medição efetivamente paga pelo banco,
// lançada manualmente pelo proprietário conforme o extrato (mesmo padrão da
// aba "Contas a pagar" da planilha original, que registra "MEDIÇÃO 01, 02,
// 03..." por mês), mais o valor que o CAIXA já passou do lote (taxas e
// projetos, financiado junto da aquisição do lote). É essa soma — não o
// cronograma de etapas acima — que define resumo.caixaLiberadaAcumulada e o
// card "Valor caixa liberado".
function renderLiberacoesCaixaPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  const custoLoteExecutado = Number((STATE.parametros || {}).custoLoteExecutado) || 0;
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Liberações reais do CAIXA</h2>
        <div class="muted">Lance aqui cada medição do banco (data, valor e status). Marque como Planejado uma medição ainda não confirmada e mude para Realizado quando o banco liberar de fato — só Realizado entra no total liberado e no card "Valor caixa liberado". A soma das medições Realizado com o valor que o CAIXA já passou do lote (${money(custoLoteExecutado)}, ajustável em Parâmetros) é o card "Valor caixa liberado". Filtre por quinzena para ver só as liberações daquele período (o valor do lote, sem data específica, some do filtro).</div>
      </div>
      <button class="btn primary" id="btnNovaLiberacao">+ Nova liberação</button>
    </div>
    <div class="quinzenaFilterSlot"></div>
    <div class="table-scroll"></div>
  `;
  const periodsPci = buildQuinzenaPeriods(STATE.meta?.dataInicio, STATE.meta?.previsaoTermino);
  panel.querySelector('.quinzenaFilterSlot').appendChild(renderQuinzenaFilter({
    periods: periodsPci,
    selected: FILTRO_QUINZENA_PCI,
    onChange: (v) => { FILTRO_QUINZENA_PCI = v; renderPCI(); },
  }));
  const wrap = panel.querySelector('.table-scroll');
  const liberacoes = (STATE.liberacoesCaixa || []).filter((l) => dataNaQuinzena(l.data, FILTRO_QUINZENA_PCI));
  const mostrarLote = !FILTRO_QUINZENA_PCI && custoLoteExecutado > 0;
  const loteRow = mostrarLote
    ? `<tr>
        <td>—</td>
        <td class="num">${money(custoLoteExecutado)}</td>
        <td><span class="badge green">REALIZADO</span></td>
        <td class="wrap">Valor que o CAIXA já passou do lote (taxas e projetos)</td>
        <td></td>
      </tr>`
    : '';
  // Só REALIZADO conta no total efetivamente liberado (mesmo valor de
  // resumo.caixaLiberadaAcumulada) — uma liberação PLANEJADO fica registrada
  // mas ainda não aconteceu de fato, igual às parcelas e avanços PLANEJADO.
  const totalFiltrado = (mostrarLote ? custoLoteExecutado : 0)
    + liberacoes.filter((l) => l.status !== 'PLANEJADO').reduce((a, l) => a + (Number(l.valor) || 0), 0);
  if (!liberacoes.length && !mostrarLote) {
    wrap.innerHTML = `<div class="muted">${FILTRO_QUINZENA_PCI ? 'Nenhuma liberação lançada nessa quinzena.' : 'Nenhuma liberação lançada ainda.'}</div>`;
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'data';
    tbl.innerHTML = `<thead><tr><th>Data</th><th class="num">Valor</th><th>Status</th><th class="wrap">Observação</th><th></th></tr></thead>
      <tbody>${loteRow}</tbody>
      <tfoot><tr><td>${FILTRO_QUINZENA_PCI ? 'TOTAL REALIZADO (quinzena filtrada)' : 'TOTAL REALIZADO'}</td><td class="num">${money(FILTRO_QUINZENA_PCI ? totalFiltrado : STATE.resumo.caixaLiberadaAcumulada)}</td><td colspan="3"></td></tr></tfoot>`;
    const tbody = tbl.querySelector('tbody');
    for (const l of liberacoes) {
      const tr = document.createElement('tr');
      tr.appendChild(td(dateInput({ value: l.data, onSave: (v) => api('PUT', `/api/liberacoes-caixa/${l.id}`, { data: v }) })));
      tr.appendChild(td(moneyInput({ value: l.valor, onSave: (v) => api('PUT', `/api/liberacoes-caixa/${l.id}`, { valor: v }) })));
      tr.appendChild(td(selectInput({
        value: l.status || 'REALIZADO',
        options: ['PLANEJADO', 'REALIZADO'],
        onSave: (v) => api('PUT', `/api/liberacoes-caixa/${l.id}`, { status: v }),
      })));
      tr.appendChild(td(textInput({ value: l.obs, wide: true, onSave: (v) => api('PUT', `/api/liberacoes-caixa/${l.id}`, { obs: v }) })));
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.onclick = () => { if (confirm('Remover esta liberação?')) api('DELETE', `/api/liberacoes-caixa/${l.id}`); };
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    }
    wrap.appendChild(tbl);
  }
  panel.querySelector('#btnNovaLiberacao').onclick = () => openNovaLiberacaoCaixaModal();
  return panel;
}

function openNovaLiberacaoCaixaModal() {
  openModal('Nova liberação real do CAIXA', (body, close) => {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <label>Data<input name="data" type="date" required /></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" required /></label>
      <label>Status
        <select name="status"><option value="REALIZADO" selected>Realizado</option><option value="PLANEJADO">Planejado</option></select>
      </label>
      <label style="grid-column: 1 / -1">Observação (ex.: "Medição 05")<input name="obs" /></label>
      <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn" id="cancelBtn">Cancelar</button>
        <button type="submit" class="btn primary">Adicionar</button>
      </div>
    `;
    form.querySelector('#cancelBtn').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      await api('POST', '/api/liberacoes-caixa', payload);
      close();
    });
    body.appendChild(form);
  });
}

// Mesmas 20 categorias do Detalhamento FC, mas com a verba CAIXA (crédito PCI
// destinado a cada serviço) em vez da verba do contrato do empreiteiro — as
// duas etapas de liberação (6 marcos macro acima + esta, por categoria) somam
// o mesmo crédito CAIXA total, só vistas por duas lentes diferentes.
function renderLiberacaoPorCategoria() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Liberação por categoria (verba CAIXA)</h2>
        <div class="muted">Mesmas 20 categorias do Detalhamento FC — aqui com a verba do crédito CAIXA (não a do contrato do empreiteiro). Libera automaticamente na mesma proporção do % de avanço efetivo da categoria. Use "liberado manual" quando o banco liberar valor diferente do calculado.</div>
      </div>
    </div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Nº</th><th class="wrap">Categoria</th><th class="num">Verba CAIXA</th>
      <th class="num">% avanço</th><th class="num">Liberado (auto)</th><th class="num">Liberado manual (opcional)</th><th class="num">Saldo</th>
    </tr></thead><tbody></tbody>
    <tfoot></tfoot></table></div>
  `;
  const tbody = panel.querySelector('tbody');
  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${c.numero}`));
    tr.appendChild(td(`<span class="wrap">${esc(c.nome)}</span>`));
    tr.appendChild(td(numberInput({ value: c.verbaCaixa, onSave: (v) => api('PUT', `/api/categorias/${c.id}`, { verbaCaixa: v }) })));
    tr.appendChild(td(`<span class="num">${pct(c.percAvancoEfetivo)}</span>`));
    tr.appendChild(td(`<span class="num" style="font-weight:700">${money(c.caixaLiberadoCategoria)}</span> <span class="badge ${c.origemCaixaCategoria === 'manual' ? 'blue' : 'gray'}">${c.origemCaixaCategoria}</span>`));
    const manualTd = document.createElement('td');
    const manualInput = numberInput({
      value: c.liberadoCaixaManual == null ? '' : c.liberadoCaixaManual,
      manual: c.liberadoCaixaManual != null,
      onSave: (v) => api('PUT', `/api/categorias/${c.id}`, { liberadoCaixaManual: v }),
    });
    manualInput.placeholder = 'automático';
    manualTd.appendChild(manualInput);
    if (c.liberadoCaixaManual != null) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn small'; clearBtn.style.marginLeft = '6px'; clearBtn.textContent = 'auto';
      clearBtn.onclick = () => api('PUT', `/api/categorias/${c.id}`, { liberadoCaixaManual: null });
      manualTd.appendChild(clearBtn);
    }
    tr.appendChild(manualTd);
    tr.appendChild(td(`<span class="num">${money(c.saldoCaixaCategoria)}</span>`));
    tbody.appendChild(tr);
  }
  const tfoot = panel.querySelector('tfoot');
  const r = STATE.resumo;
  tfoot.innerHTML = `<tr>
    <td colspan="2">TOTAL</td>
    <td class="num">${money(r.totalVerbaCaixaCategorias)}</td>
    <td></td>
    <td class="num">${money(r.totalCaixaLiberadoCategorias)}</td>
    <td></td>
    <td class="num">${money(r.totalVerbaCaixaCategorias - r.totalCaixaLiberadoCategorias)}</td>
  </tr>`;
  return panel;
}

// Itens que já consumiram o recurso próprio (Maio/1ª, Maio/2ª, Junho/1ª,
// entrada do lote, serviços preliminares...), editáveis/adicionáveis — o
// saldo de recurso próprio disponível é recalculado automaticamente como
// planejado − soma da lista (mesma lógica que "Liberações reais do CAIXA").
// Um valor manual único ainda pode sobrescrever tudo, para o caso raro em
// que nem a lista reflete o saldo real em conta.
function renderConsumosRecursoProprioPanel() {
  const r = STATE.resumo;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Saldo de recurso próprio disponível</h2>
        <div class="muted">Recurso próprio planejado (${money(STATE.parametros.recursoProprioPlanejado)}) menos cada item que já consumiu esse saldo. O recurso próprio só foi usado nos meses antes da liberação do CAIXA começar a fluir, mas pode ser usado de novo se o fluxo de caixa exigir — lance/edite os itens conforme o extrato real.</div>
      </div>
      <button class="btn primary" id="btnNovoConsumo">+ Novo item</button>
    </div>
    <div class="table-scroll"></div>
  `;
  const wrap = panel.querySelector('.table-scroll');
  const itens = STATE.consumosRecursoProprio || [];
  if (!itens.length) {
    wrap.innerHTML = '<div class="muted">Nenhum item lançado ainda — o saldo usa o cálculo automático simples (investido − gasto acumulado).</div>';
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'data';
    tbl.innerHTML = `<thead><tr><th class="wrap">Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody></tbody>
      <tfoot><tr><td>TOTAL CONSUMIDO</td><td class="num">${money(r.totalConsumoRecursoProprio)}</td><td></td></tr>
      <tr><td>SALDO RESULTANTE (planejado − consumido)</td><td class="num" style="font-weight:700">${money(r.saldoRecursoProprioPorItens)}</td><td></td></tr></tfoot>`;
    const tbody = tbl.querySelector('tbody');
    for (const item of itens) {
      const tr = document.createElement('tr');
      tr.appendChild(td(textInput({ value: item.descricao, wide: true, onSave: (v) => api('PUT', `/api/consumos-recurso-proprio/${item.id}`, { descricao: v }) })));
      tr.appendChild(td(moneyInput({ value: item.valor, onSave: (v) => api('PUT', `/api/consumos-recurso-proprio/${item.id}`, { valor: v }) })));
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.onclick = () => { if (confirm(`Remover "${item.descricao}"?`)) api('DELETE', `/api/consumos-recurso-proprio/${item.id}`); };
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    }
    wrap.appendChild(tbl);
  }
  panel.querySelector('#btnNovoConsumo').onclick = () => {
    openModal('Novo item — consumo de recurso próprio', (body, close) => {
      const form = document.createElement('form');
      form.className = 'form-grid';
      form.innerHTML = `
        <label style="grid-column: 1 / -1">Descrição<input name="descricao" placeholder="Ex.: Julho/1º parcela" required /></label>
        <label>Valor (R$)<input name="valor" type="number" step="0.01" required /></label>
        <div style="grid-column: 1 / -1; display:flex; gap:8px; justify-content:flex-end;">
          <button type="button" class="btn" id="cancelBtn">Cancelar</button>
          <button type="submit" class="btn primary">Adicionar</button>
        </div>
      `;
      form.querySelector('#cancelBtn').onclick = close;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(form).entries());
        await api('POST', '/api/consumos-recurso-proprio', payload);
        close();
      });
      body.appendChild(form);
    });
  };

  const advDetails = document.createElement('details');
  advDetails.className = 'scurve-table-details';
  advDetails.innerHTML = '<summary>Avançado: forçar um valor manual único (ignora a lista acima)</summary>';
  const advBody = document.createElement('div');
  advBody.className = 'form-grid';
  advBody.style.marginTop = '8px';
  const advWrap = document.createElement('label');
  advWrap.textContent = `Saldo de recurso próprio disponível (R$) — pela lista seria: ${money(r.saldoRecursoProprioPorItens)}; automático simples seria: ${money(r.saldoRecursoDisponivelAuto)}`;
  const advInputWrap = document.createElement('div');
  advInputWrap.style.display = 'flex';
  advInputWrap.style.gap = '6px';
  advInputWrap.style.alignItems = 'center';
  const saldoManual = STATE.parametros.saldoRecursoDisponivelManual;
  const advInput = numberInput({
    value: saldoManual == null ? '' : saldoManual,
    manual: saldoManual != null,
    wide: true,
    onSave: (v) => api('PUT', '/api/parametros', { saldoRecursoDisponivelManual: v }),
  });
  advInput.placeholder = 'nenhum — usa a lista acima';
  advInputWrap.appendChild(advInput);
  if (saldoManual != null) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn small';
    clearBtn.textContent = 'usar a lista acima';
    clearBtn.onclick = () => api('PUT', '/api/parametros', { saldoRecursoDisponivelManual: null });
    advInputWrap.appendChild(clearBtn);
  }
  advWrap.appendChild(advInputWrap);
  advBody.appendChild(advWrap);
  advDetails.appendChild(advBody);
  panel.appendChild(advDetails);

  return panel;
}

/* ==========================================================================
   TAB 6 — Parâmetros
   ========================================================================== */
function renderParametros() {
  const root = document.getElementById('tab-parametros');
  root.innerHTML = '';

  const obraPanel = document.createElement('div');
  obraPanel.className = 'panel';
  obraPanel.innerHTML = `<div class="panel-header"><h2>Dados da obra</h2></div>`;
  const obraForm = document.createElement('div');
  obraForm.className = 'form-grid';
  const metaFields = [
    ['obra', 'Nome da obra'], ['endereco', 'Endereço'], ['proprietario', 'Proprietário'],
    ['responsavelTecnico', 'Responsável técnico'], ['areaM2', 'Área (m²)'],
    ['dataInicio', 'Data de início'], ['previsaoTermino', 'Previsão de término'],
  ];
  for (const [key, label] of metaFields) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const isDate = key.startsWith('data') || key.startsWith('previsao');
    const input = document.createElement('input');
    input.type = isDate ? 'date' : (key === 'areaM2' ? 'number' : 'text');
    input.value = STATE.meta[key] ?? '';
    input.addEventListener('blur', () => api('PUT', '/api/meta', { [key]: isDate ? (input.value || null) : (key === 'areaM2' ? Number(input.value) : input.value) }));
    wrap.appendChild(input);
    obraForm.appendChild(wrap);
  }
  obraPanel.appendChild(obraForm);
  root.appendChild(obraPanel);

  const paramPanel = document.createElement('div');
  paramPanel.className = 'panel';
  paramPanel.innerHTML = `<div class="panel-header"><h2>Parâmetros financeiros</h2><div class="muted">Base para os cálculos de liberação de caixa e saldo disponível.</div></div>`;
  const paramForm = document.createElement('div');
  paramForm.className = 'form-grid';
  const paramFields = [
    ['recursoProprioPlanejado', 'Recurso próprio planejado (R$)'],
    ['financiamentoObraCaixa', 'Financiamento obra — CAIXA (R$)'],
    ['financiamentoLoteCaixa', 'Financiamento lote — CAIXA (R$)'],
    ['contratoTotalEmpreiteiro', 'Contrato total empreiteiro (R$)'],
    ['custoLoteExecutado', 'Custo do lote já executado (R$) — taxas e projetos'],
    ['taxaAdministracaoPercent', 'Taxa de administração (%) — RS Engenharia'],
    ['taxaJurosAnualCEF', 'Taxa de juros anual CEF (%)'],
  ];
  for (const [key, label] of paramFields) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const isPercent = key.toLowerCase().includes('percent') || key.toLowerCase().includes('taxa');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = isPercent ? Math.round((STATE.parametros[key] || 0) * 10000) / 100 : STATE.parametros[key];
    input.addEventListener('blur', () => api('PUT', '/api/parametros', { [key]: isPercent ? Number(input.value) / 100 : Number(input.value) }));
    wrap.appendChild(input);
    paramForm.appendChild(wrap);
  }
  paramPanel.appendChild(paramForm);
  root.appendChild(paramPanel);

  root.appendChild(renderConsumosRecursoProprioPanel());

  const dangerPanel = document.createElement('div');
  dangerPanel.className = 'panel';
  dangerPanel.innerHTML = `<div class="panel-header"><h2>Dados</h2></div>
    <div class="muted" style="margin-bottom:8px">Restaura todos os dados para os valores originais extraídos da planilha (Casa Newton — Toscana). Isso apaga edições feitas no app.</div>`;
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn danger';
  resetBtn.textContent = 'Restaurar dados originais da planilha';
  resetBtn.onclick = async () => {
    if (confirm('Tem certeza? Todas as edições feitas no app serão perdidas.')) {
      await api('POST', '/api/reset');
      toast('Dados restaurados.');
    }
  };
  dangerPanel.appendChild(resetBtn);
  root.appendChild(dangerPanel);
}

/* ==========================================================================
   Modal genérico
   ========================================================================== */
function openModal(title, buildBody) {
  const tpl = document.getElementById('tpl-modal');
  const node = tpl.content.cloneNode(true);
  const backdrop = node.querySelector('.modal-backdrop');
  node.querySelector('h3').textContent = title;
  const body = node.querySelector('.modal-body');
  const close = () => backdrop.remove();
  node.querySelector('.modal-close').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  buildBody(body, close);
  document.body.appendChild(node);
}

/* ==========================================================================
   Init
   ========================================================================== */
setupTabs();
loadState().catch((e) => { console.error(e); toast('Erro ao carregar dados.', true); });
