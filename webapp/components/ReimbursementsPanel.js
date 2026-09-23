'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PROJECTS } from '../lib/projects';

const wrap = { maxWidth: 920, margin: '0 auto', padding: '28px 20px', fontFamily: "'Public Sans', system-ui, sans-serif" };
const h1 = { fontFamily: "'Fraunces', serif", fontSize: 24, margin: '0 0 4px', color: '#241220' };
const sub = { fontSize: 13, color: '#6B5566', margin: '0 0 20px' };
const backLink = { fontSize: 13, color: '#B8156A', textDecoration: 'none', fontWeight: 600 };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #F1D3E5', padding: '18px 20px', marginBottom: 20 };
const h2 = { fontSize: 15, margin: '0 0 12px', color: '#241220' };
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#241220', margin: '12px 0 5px' };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
  border: '1px solid #F1D3E5', fontSize: 13.5, fontFamily: 'inherit',
};
const btn = { marginTop: 16, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#E01F7F', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const btnSm = (bg, fg) => ({ padding: '5px 10px', borderRadius: 6, border: 'none', background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 });
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #F1D3E5' };
const th = { textAlign: 'left', padding: '9px 10px', background: '#FBE9F4', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6B5566' };
const td = { padding: '9px 10px', borderTop: '1px solid #F7E4EF', verticalAlign: 'top' };
const badge = (bg, fg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: bg, color: fg });
const kpiRow = { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 };
const kpi = { flex: '1 1 160px', background: '#fff', borderRadius: 12, border: '1px solid #F1D3E5', padding: '14px 16px' };
const kpiLbl = { fontSize: 11.5, color: '#6B5566', marginBottom: 4 };
const kpiVal = { fontSize: 19, fontWeight: 700, color: '#241220', fontFamily: 'monospace' };

const STATUS_BADGE = {
  pendente: badge('#FBEACC', '#C1780F'),
  aprovado: badge('#DCF0E6', '#1E8F63'),
  rejeitado: badge('#FAE0E2', '#D6323F'),
};
const STATUS_LABEL = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };

function fmtCur(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Aba de Restituição de Caixa: qualquer usuário aprovado (admin ou convidado) pode
// lançar uma compra feita do próprio bolso e anexar o comprovante (imagem/PDF);
// só administrador aprova ou rejeita. O total aprovado entra automaticamente como
// custo real do evento (ver PmoFrame.js -> restituicoesAprovadas).
export default function ReimbursementsPanel({ auth, project, onChangeProject }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ descricao: '', valor: '', dataCompra: '', file: null });
  const [obsDraft, setObsDraft] = useState({});

  const load = useCallback(async () => {
    setErr('');
    const { data, error } = await supabase
      .from('reimbursements')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message); else setRows(data);
  }, [project.id]);

  useEffect(() => { setRows(null); load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.descricao.trim() || !form.valor || !form.file) {
      setErr('Preencha a descrição, o valor e anexe o comprovante.');
      return;
    }
    setSending(true);
    try {
      const ext = (form.file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `${project.id}/${auth.user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('comprovantes').upload(path, form.file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('reimbursements').insert({
        project_id: project.id,
        user_id: auth.user.id,
        user_email: auth.user.email,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_compra: form.dataCompra || null,
        comprovante_path: path,
      });
      if (insErr) throw insErr;
      setForm({ descricao: '', valor: '', dataCompra: '', file: null });
      const fileInput = document.getElementById('comprovanteFile');
      if (fileInput) fileInput.value = '';
      load();
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setSending(false);
    }
  }

  async function removeMine(id) {
    if (!window.confirm('Excluir este lançamento pendente?')) return;
    setBusyId(id);
    const { error } = await supabase.from('reimbursements').delete().eq('id', id);
    setBusyId(null);
    if (error) setErr(error.message); else load();
  }

  async function review(id, status) {
    const obs = obsDraft[id] || null;
    if (status === 'rejeitado' && !window.confirm('Rejeitar este lançamento?')) return;
    setBusyId(id);
    const { error } = await supabase.rpc('admin_review_reimbursement', { target_id: id, new_status: status, admin_obs: obs });
    setBusyId(null);
    if (error) setErr(error.message); else load();
  }

  async function viewComprovante(path) {
    const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(path, 300);
    if (error) { setErr(error.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const totalAprovado = (rows || []).filter(r => r.status === 'aprovado').reduce((a, r) => a + Number(r.valor || 0), 0);
  const totalPendente = (rows || []).filter(r => r.status === 'pendente').reduce((a, r) => a + Number(r.valor || 0), 0);
  const minhas = (rows || []).filter(r => r.user_id === auth.user.id);
  const isAdmin = auth.isAdmin;

  return (
    <div style={wrap}>
      <a href="/" style={backLink}>← Voltar para o app</a>
      <h1 style={{ ...h1, marginTop: 14 }}>💸 Restituição de Caixa</h1>
      <p style={sub}>
        Lance aqui compras feitas do próprio bolso, com o comprovante em anexo. Assim que um administrador aprova,
        o valor entra automaticamente como custo real de <strong>{project.label}</strong> nas avaliações financeiras.
      </p>
      {PROJECTS.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <label style={label}>Evento</label>
          <select style={{ ...input, maxWidth: 320 }} value={project.id} onChange={e => onChangeProject(e.target.value)}>
            {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
          </select>
        </div>
      )}

      <div style={kpiRow}>
        <div style={kpi}><div style={kpiLbl}>Total aprovado (soma como custo)</div><div style={kpiVal}>{fmtCur(totalAprovado)}</div></div>
        <div style={kpi}><div style={kpiLbl}>Total pendente de aprovação</div><div style={kpiVal}>{fmtCur(totalPendente)}</div></div>
      </div>

      {err && <p style={{ color: '#D6323F', fontSize: 13 }}>{err}</p>}

      <div style={card}>
        <h2 style={h2}>Novo lançamento</h2>
        <form onSubmit={submit}>
          <label style={label}>Descrição da compra</label>
          <input style={input} type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: Fita isolante e pilhas para o som" />
          <label style={label}>Valor (R$)</label>
          <input style={input} type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          <label style={label}>Data da compra</label>
          <input style={input} type="date" value={form.dataCompra} onChange={e => setForm(f => ({ ...f, dataCompra: e.target.value }))} />
          <label style={label}>Comprovante (imagem ou PDF)</label>
          <input id="comprovanteFile" style={input} type="file" accept="image/*,application/pdf" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))} />
          <button style={{ ...btn, opacity: sending ? .6 : 1 }} type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Enviar para aprovação'}</button>
        </form>
      </div>

      <div style={card}>
        <h2 style={h2}>Meus lançamentos</h2>
        {!rows ? <p style={sub}>Carregando…</p> : minhas.length === 0 ? <p style={sub}>Você ainda não lançou nenhuma restituição.</p> : (
          <table style={table}>
            <thead><tr><th style={th}>Descrição</th><th style={th}>Valor</th><th style={th}>Data</th><th style={th}>Status</th><th style={th}>Comprovante</th><th style={th}></th></tr></thead>
            <tbody>
              {minhas.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.descricao}{r.obs_admin ? <div style={{ fontSize: 11.5, color: '#6B5566', marginTop: 2 }}>Obs. admin: {r.obs_admin}</div> : null}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{fmtCur(r.valor)}</td>
                  <td style={td}>{r.data_compra || '—'}</td>
                  <td style={td}><span style={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                  <td style={td}>{r.comprovante_path ? <button style={btnSm('#FBE9F4', '#B8156A')} onClick={() => viewComprovante(r.comprovante_path)}>Ver</button> : '—'}</td>
                  <td style={td}>{r.status === 'pendente' && (busyId === r.id ? '…' : <button style={btnSm('#FAE0E2', '#D6323F')} onClick={() => removeMine(r.id)}>Excluir</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <div style={card}>
          <h2 style={h2}>Aprovação (administrador) — todos os lançamentos de {project.label}</h2>
          {!rows ? <p style={sub}>Carregando…</p> : rows.length === 0 ? <p style={sub}>Nenhum lançamento ainda.</p> : (
            <table style={table}>
              <thead><tr><th style={th}>Quem lançou</th><th style={th}>Descrição</th><th style={th}>Valor</th><th style={th}>Data</th><th style={th}>Comprovante</th><th style={th}>Status</th><th style={th}>Observação</th><th style={th}>Ações</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={td}>{r.user_email}</td>
                    <td style={td}>{r.descricao}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{fmtCur(r.valor)}</td>
                    <td style={td}>{r.data_compra || '—'}</td>
                    <td style={td}>{r.comprovante_path ? <button style={btnSm('#FBE9F4', '#B8156A')} onClick={() => viewComprovante(r.comprovante_path)}>Ver</button> : '—'}</td>
                    <td style={td}><span style={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                    <td style={td}>
                      <input
                        style={{ ...input, fontSize: 12, padding: '5px 7px', minWidth: 140 }}
                        type="text" placeholder="opcional"
                        defaultValue={r.obs_admin || ''}
                        onChange={e => setObsDraft(d => ({ ...d, [r.id]: e.target.value }))}
                      />
                    </td>
                    <td style={td}>
                      {busyId === r.id ? '…' : (
                        <>
                          {r.status !== 'aprovado' && <button style={btnSm('#1E8F63', '#fff')} onClick={() => review(r.id, 'aprovado')}>Aprovar</button>}
                          {r.status !== 'rejeitado' && <button style={btnSm('#FAE0E2', '#D6323F')} onClick={() => review(r.id, 'rejeitado')}>Rejeitar</button>}
                          {r.status !== 'pendente' && <button style={btnSm('#FBEACC', '#C1780F')} onClick={() => review(r.id, 'pendente')}>Reabrir</button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
