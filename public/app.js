'use strict';

/* ==========================================================================
   Estado global + utilidades
   ========================================================================== */
let STATE = null;
let ACTIVE_TAB = 'dashboard';
const OPEN_CATEGORIES = new Set();
let LANCAMENTO_MENSAL_OPEN = false;

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
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
   ainda não realizadas) com a verba disponível (Saldo Caixa + Saldo de recurso
   disponível) e avisa quando estoura — não ajusta nada automaticamente, é só
   acompanhamento (usado no Dashboard e no Fluxo de Caixa). */
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
      <div class="card-sub">Saldo caixa (a liberar) + Saldo de recurso disponível</div>
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
      <div class="card-label">Avanço caixa (% liberado)</div>
      <div class="card-value">${pct(r.percCaixaLiberada)}</div>
      <div class="progress-bar" style="margin-top:6px"><span style="width:${Math.min(100, r.percCaixaLiberada * 100)}%"></span></div>
      <div class="card-sub">Liberado: ${money(r.caixaLiberadaAcumulada)} de ${money(r.creditoCaixaTotalPCI)}</div>
    </div>
    <div class="card">
      <div class="card-label">Saldo caixa (a liberar)</div>
      <div class="card-value">${money(r.saldoCaixaDisponivel)}</div>
      <div class="card-sub">Crédito PCI total − já liberado</div>
    </div>
    <div class="card ${r.saldoRecursoDisponivel < 0 ? 'warn' : 'good'}">
      <div class="card-label">Saldo de recurso disponível</div>
      <div class="card-value">${money(r.saldoRecursoDisponivel)}</div>
      <div class="card-sub">Recurso próprio + caixa liberado − gasto acumulado</div>
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
      <div class="card-label">Pago direto (fora do empreiteiro)</div>
      <div class="card-value">${money(r.totalPagoDiretoProprietario)}</div>
      <div class="card-sub">Ex.: Serviços Preliminares — topografia, projetos, prefeitura, cartório. Já descontado do saldo de recurso disponível.</div>
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
    tr.appendChild(td(numberInput({ value: p.totalEmpreiteiroPix, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalEmpreiteiroPix: v }) })));
    tr.appendChild(td(numberInput({ value: p.totalAdmPix, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalAdmPix: v }) })));
    tr.appendChild(td(numberInput({ value: p.gastoCartao, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { gastoCartao: v }) })));
    tr.appendChild(td(numberInput({ value: p.totalATransferir, manual: !!p.overrides?.totalATransferir, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { totalATransferir: v }) })));
    tr.appendChild(td(numberInput({ value: p.parcelaEvolucaoCaixa, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { parcelaEvolucaoCaixa: v }) })));
    tr.appendChild(td(numberInput({ value: p.custoTotal, manual: !!p.overrides?.custoTotal, onSave: (v) => api('PUT', `/api/parcelas/${p.id}`, { custoTotal: v }) })));
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
   TAB 2 — Lançar Avanços
   ========================================================================== */
function renderAvancos() {
  const root = document.getElementById('tab-avancos');
  root.innerHTML = '';

  const info = document.createElement('div');
  info.className = 'panel';
  info.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Lançar avanços da obra</h2>
        <div class="muted">Informe o % de avanço físico/financeiro de cada categoria. O sistema recalcula automaticamente a liberação de caixa (PCI), o valor a pagar ao empreiteiro e o saldo disponível.</div>
      </div>
      <div class="legend">
        <span><span class="dot manual"></span>% lançado manualmente</span>
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

    const percCell = document.createElement('td');
    percCell.appendChild(numberInput({
      value: Math.round(c.percAvancoEfetivo * 1000) / 10,
      manual: c.origemPercAvanco === 'manual',
      step: '0.1', min: 0,
      onSave: (v) => api('POST', `/api/categorias/${c.id}/avanco`, { perc: v / 100 }),
    }));
    percCell.querySelector('input').title = '% de avanço (0-100). Define manualmente e desacopla da soma dos itens.';
    tr.appendChild(percCell);

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

  const hist = document.createElement('div');
  hist.className = 'panel';
  hist.innerHTML = `<div class="panel-header"><h2>Histórico de avanços lançados</h2></div>`;
  const histTable = document.createElement('div');
  histTable.className = 'table-scroll';
  if (!STATE.historicoAvancos.length) {
    histTable.innerHTML = '<div class="muted">Nenhum avanço lançado ainda.</div>';
  } else {
    histTable.innerHTML = `<table class="data"><thead><tr>
      <th>Data</th><th class="wrap">Categoria</th><th class="num">% anterior</th><th class="num">% novo</th><th class="wrap">Observação</th>
    </tr></thead><tbody>${STATE.historicoAvancos.map((h) => `
      <tr>
        <td>${dateBR(h.data)}</td>
        <td class="wrap">${esc(h.categoriaNome)}</td>
        <td class="num">${h.percAvancoAnterior == null ? '—' : pct(h.percAvancoAnterior)}</td>
        <td class="num">${pct(h.percAvancoNovo)}</td>
        <td class="wrap">${esc(h.obs)}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  hist.appendChild(histTable);
  root.appendChild(hist);
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
        <div class="muted">Datas previstas extraídas da planilha original (aba Cronograma de obra). O % realizado é o mesmo lançado na aba "Lançar Avanços" — edite aqui também. A barra clara mostra a janela planejada; a barra colorida mostra o quanto já foi executado; a linha âmbar marca a data de hoje (${dateBR(r.dataReferenciaCronograma)}).</div>
      </div>
      <div class="gantt-legend">
        <span><span class="dot" style="background:#d7deec"></span>Janela planejada</span>
        <span><span class="dot" style="background:var(--primary)"></span>Executado — no prazo</span>
        <span><span class="dot" style="background:var(--red)"></span>Executado — atrasado</span>
        <span><span class="dot" style="background:var(--green)"></span>Concluído</span>
        <span><span class="dot" style="background:var(--amber)"></span>Hoje</span>
      </div>
    </div>
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

  const tbody = panel.querySelector('tbody');
  for (const c of STATE.categorias) {
    const tr = document.createElement('tr');
    tr.appendChild(td(`${c.numero}`));
    tr.appendChild(td(`<span class="wrap">${esc(c.nome)}</span>`));
    tr.appendChild(td(c.cronogramaPrevisto ? dateBR(c.cronogramaPrevisto.inicio) : '—'));
    tr.appendChild(td(c.cronogramaPrevisto ? dateBR(c.cronogramaPrevisto.termino) : '—'));
    tr.appendChild(td(`<span class="num">${c.cronogramaPrevisto ? c.cronogramaPrevisto.duracaoDias : '—'}</span>`));
    tr.appendChild(td(`<span class="num">${pct(c.percPrevisto)}</span>`));

    const percCell = document.createElement('td');
    percCell.appendChild(numberInput({
      value: Math.round(c.percAvancoEfetivo * 1000) / 10,
      manual: c.origemPercAvanco === 'manual',
      step: '0.1', min: 0,
      onSave: (v) => api('POST', `/api/categorias/${c.id}/avanco`, { perc: v / 100 }),
    }));
    tr.appendChild(percCell);

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
function renderDetalhamento() {
  const root = document.getElementById('tab-detalhamento');
  root.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'panel';
  header.innerHTML = `<div class="panel-header">
    <div>
      <h2>Detalhamento FC — orçado x realizado por item</h2>
      <div class="muted">Cada categoria soma seus itens automaticamente. Edite valores realizados, orçados, datas e forma de pagamento; adicione ou remova itens conforme o lançamento real.</div>
    </div>
  </div>`;
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
      tr.appendChild(td(numberInput({ value: it.valorRealizado, manual: true, onSave: (v) => api('PUT', `/api/categorias/${c.id}/itens/${it.id}`, { valorRealizado: v }) })));
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

    block.appendChild(body);
    root.appendChild(block);
  }
}

/* ==========================================================================
   TAB 4 — Fluxo de Caixa: lançar avanço do mês (gera parcela em Contas a Pagar)
   ========================================================================== */
function renderLancamentoMensalPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <div>
      <h2>Lançar avanço do mês</h2>
      <div class="muted">Informe o novo % acumulado das categorias que avançaram — o peso de cada uma (já estipulado pelo valor orçado) rateia o valor gerado. O sistema desconta o cartão, sugere o PIX ao empreiteiro e à administração, e cria a parcela em Contas a Pagar.</div>
    </div>
  `;
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn primary';
  toggleBtn.textContent = LANCAMENTO_MENSAL_OPEN ? 'Fechar' : 'Lançar avanço do mês';
  toggleBtn.onclick = () => { LANCAMENTO_MENSAL_OPEN = !LANCAMENTO_MENSAL_OPEN; renderFluxo(); };
  header.appendChild(toggleBtn);
  panel.appendChild(header);

  if (!LANCAMENTO_MENSAL_OPEN) return panel;

  const body = document.createElement('div');
  body.className = 'table-scroll';
  body.innerHTML = `<table class="data">
    <thead><tr>
      <th>Nº</th><th class="wrap">Categoria</th><th class="num">Peso</th><th class="num">Valor orçado</th>
      <th class="num">% atual</th><th class="num">Novo % acumulado</th><th class="num">Valor gerado</th>
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
    novoPercInput.type = 'number'; novoPercInput.step = '0.1'; novoPercInput.min = '0';
    novoPercInput.className = 'cell-input';
    novoPercInput.value = percAtual;
    tr.appendChild(td(novoPercInput));

    const valorGeradoCell = document.createElement('td');
    valorGeradoCell.className = 'num';
    valorGeradoCell.textContent = money(0);
    tr.appendChild(valorGeradoCell);

    tbody.appendChild(tr);
    rows.push({ categoria: c, percAtual, novoPercInput, valorGeradoCell });
  }
  panel.appendChild(body);

  const summary = document.createElement('div');
  summary.className = 'form-grid';
  summary.style.marginTop = '12px';
  summary.innerHTML = `
    <label>Rótulo da parcela
      <input id="lmLabel" type="text" value="Avanço ${new Date().toISOString().slice(0, 10)}" />
    </label>
    <label>Gasto no cartão neste mês (R$)
      <input id="lmCartao" type="number" step="0.01" value="0" />
    </label>
    <label>Data em que o custo foi gerado
      <input id="lmDataCusto" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    </label>
    <label>Para qual mês/parcela ele vai ocorrer (vencimento planejado)
      <input id="lmVenc" type="date" />
    </label>
    <label style="grid-column: 1 / -1">Observação
      <textarea id="lmObs"></textarea>
    </label>
  `;
  panel.appendChild(summary);
  summary.querySelector('#lmVenc').addEventListener('change', (e) => {
    const suggestion = mesParcelaLabel(e.target.value);
    if (suggestion) summary.querySelector('#lmLabel').value = suggestion;
  });

  const totals = document.createElement('div');
  totals.className = 'cards-grid';
  totals.style.marginTop = '4px';
  totals.innerHTML = `
    <div class="card"><div class="card-label">Valor gerado no mês</div><div class="card-value" id="lmValorGerado">${money(0)}</div></div>
    <div class="card"><div class="card-label">Sugestão empreiteiro (PIX)</div><div class="card-value" id="lmEmpreiteiro">${money(0)}</div></div>
    <div class="card"><div class="card-label">Sugestão administração (PIX)</div><div class="card-value" id="lmAdm">${money(0)}</div></div>
  `;
  panel.appendChild(totals);

  function recalcPreview() {
    let valorGeradoMes = 0;
    for (const r of rows) {
      const novoPerc = Number(r.novoPercInput.value) || 0;
      const deltaValor = r.categoria.valorOrcado * ((novoPerc - r.percAtual) / 100);
      r.valorGeradoCell.textContent = money(deltaValor);
      r.valorGeradoCell.style.color = deltaValor > 0.004 ? 'var(--green)' : deltaValor < -0.004 ? 'var(--red)' : '';
      valorGeradoMes += deltaValor;
    }
    const gastoCartao = Number(panel.querySelector('#lmCartao').value) || 0;
    const taxaAdm = STATE.parametros.taxaAdministracaoPercent || 0;
    const empreiteiro = Math.max(0, valorGeradoMes - gastoCartao);
    const adm = empreiteiro * taxaAdm;
    panel.querySelector('#lmValorGerado').textContent = money(valorGeradoMes);
    panel.querySelector('#lmEmpreiteiro').textContent = money(empreiteiro);
    panel.querySelector('#lmAdm').textContent = money(adm);
  }
  rows.forEach((r) => r.novoPercInput.addEventListener('input', recalcPreview));
  summary.querySelector('#lmCartao').addEventListener('input', recalcPreview);
  recalcPreview();

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; justify-content:flex-end; margin-top:12px;';
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn primary';
  submitBtn.textContent = 'Gerar parcela em Contas a Pagar';
  submitBtn.onclick = async () => {
    const avancos = rows
      .filter((r) => Math.abs(Number(r.novoPercInput.value) - r.percAtual) > 0.001)
      .map((r) => ({ categoriaId: r.categoria.id, novoPerc: Number(r.novoPercInput.value) / 100 }));
    if (!avancos.length) { toast('Altere o % de ao menos uma categoria.', true); return; }
    const payload = {
      avancos,
      gastoCartao: Number(panel.querySelector('#lmCartao').value) || 0,
      label: panel.querySelector('#lmLabel').value,
      dataGeracaoCusto: panel.querySelector('#lmDataCusto').value || null,
      data: panel.querySelector('#lmDataCusto').value || null,
      vencPlanejado: panel.querySelector('#lmVenc').value || null,
      obs: panel.querySelector('#lmObs').value,
    };
    try {
      const data = await api('POST', '/api/lancamento-mensal', payload);
      LANCAMENTO_MENSAL_OPEN = false;
      renderAll();
      if (!toastAjuste(data)) toast('Parcela gerada em Contas a Pagar.');
    } catch (e) { /* erro já mostrado pelo api() */ }
  };
  actions.appendChild(submitBtn);
  panel.appendChild(actions);

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
      <div class="card-sub">Saldo caixa (a liberar): ${money(r.saldoCaixaDisponivel)}</div>
    </div>
  `;
  root.appendChild(tracking);
  root.appendChild(renderVerbaFuturaBlock());

  root.appendChild(renderLancamentoMensalPanel());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Fluxo de caixa por mês e parcela</h2>
        <div class="muted">Organizado como em Contas a Pagar — cada mês dividido em 1º e 2º Parcela, na ordem cronológica correta. Agregado a partir de todas as parcelas lançadas (planejadas e realizadas) mais ajustes manuais. A liberação de caixa (PCI) aparece no mês originalmente programado de cada etapa. Para o saldo já efetivamente realizado, veja os cards do Dashboard.</div>
      </div>
      <button class="btn primary" id="btnNovoAjuste">+ Ajuste manual</button>
    </div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Mês / Parcela</th><th class="num">Entrada recurso próprio</th><th class="num">Entrada caixa (PCI)</th><th class="num">Entrada ajuste</th><th class="num">Entrada total</th>
      <th class="num">Saída empreiteiro (PIX)</th><th class="num">Saída ADM (PIX)</th>
      <th class="num">Saída cartão</th><th class="num">Saída ajuste</th><th class="num">Saída total</th><th class="num">Saldo acumulado</th>
    </tr></thead><tbody></tbody></table></div>
  `;
  root.appendChild(panel);
  const tbody = panel.querySelector('tbody');
  for (const m of STATE.fluxoCaixaMensal) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(m.label)}</td>
      <td class="num">${money(m.entradaRecursoProprio)}</td>
      <td class="num">${money(m.entradaCaixaPCI)}</td>
      <td class="num">${money(m.entradaAjusteManual)}</td>
      <td class="num" style="font-weight:700">${money(m.entradaTotal)}</td>
      <td class="num">${money(m.saidaEmpreiteiroPix)}</td>
      <td class="num">${money(m.saidaAdmPix)}</td>
      <td class="num">${money(m.saidaCartao)}</td>
      <td class="num">${money(m.saidaAjusteManual)}</td>
      <td class="num" style="font-weight:700">${money(m.saidaTotal)}</td>
      <td class="num" style="font-weight:700; color:${m.saldoAcumuladoMes < 0 ? 'var(--red)' : 'var(--green)'}">${money(m.saldoAcumuladoMes)}</td>
    `;
    tbody.appendChild(tr);
  }
  if (!STATE.fluxoCaixaMensal.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="muted">Nenhuma parcela lançada ainda.</td></tr>';
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
        <h2>Liberação PCI — cronograma de liberação do financiamento CAIXA</h2>
        <div class="muted">Liberação automática segue o % geral de obra (aba Lançar Avanços) dentro da faixa de cada etapa. Use "liberado manual" quando o banco liberar valor diferente do calculado.</div>
      </div>
    </div>
    <div class="table-scroll"><table class="data"><thead><tr>
      <th>Etapa</th><th class="wrap">Descrição</th><th class="num">% limite acumulado</th><th class="num">Valor da etapa</th>
      <th class="num">Mês programado</th><th class="num">% liberado</th><th class="num">Valor liberado</th><th class="num">Liberado manual (opcional)</th>
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
    tr.appendChild(td(`<span class="num">${pct(e.percLiberado)}</span>`));
    tr.appendChild(td(`<span class="num" style="font-weight:700">${money(e.valorLiberado)}</span> <span class="badge ${e.origemLiberado === 'manual' ? 'blue' : 'gray'}">${e.origemLiberado}</span>`));
    const manualTd = document.createElement('td');
    const manualInput = numberInput({
      value: e.liberadoManual == null ? '' : e.liberadoManual,
      manual: e.liberadoManual != null,
      onSave: (v) => api('PUT', `/api/liberacao-pci/${e.etapa}`, { liberadoManual: v }),
    });
    manualInput.placeholder = 'automático';
    manualTd.appendChild(manualInput);
    if (e.liberadoManual != null) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn small'; clearBtn.style.marginLeft = '6px'; clearBtn.textContent = 'auto';
      clearBtn.onclick = () => api('PUT', `/api/liberacao-pci/${e.etapa}`, { liberadoManual: null });
      manualTd.appendChild(clearBtn);
    }
    tr.appendChild(manualTd);
    tbody.appendChild(tr);
  }
  const tfoot = panel.querySelector('tfoot');
  tfoot.innerHTML = `<tr>
    <td colspan="3">TOTAL</td>
    <td class="num">${money(STATE.resumo.creditoCaixaTotalPCI)}</td>
    <td></td><td></td>
    <td class="num">${money(STATE.resumo.caixaLiberadaAcumulada)}</td>
    <td></td>
  </tr>`;
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
