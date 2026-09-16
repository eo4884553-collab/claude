'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const wrap = { maxWidth: 760, margin: '0 auto', padding: '28px 20px', fontFamily: "'Public Sans', system-ui, sans-serif" };
const h1 = { fontFamily: "'Fraunces', serif", fontSize: 24, margin: '0 0 4px', color: '#241220' };
const sub = { fontSize: 13, color: '#6B5566', margin: '0 0 20px' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #F1D3E5' };
const th = { textAlign: 'left', padding: '10px 12px', background: '#FBE9F4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6B5566' };
const td = { padding: '10px 12px', borderTop: '1px solid #F7E4EF', verticalAlign: 'middle' };
const badge = (bg, fg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: bg, color: fg });
const btn = (bg, fg) => ({ padding: '5px 10px', borderRadius: 6, border: 'none', background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 });
const backLink = { fontSize: 13, color: '#B8156A', textDecoration: 'none', fontWeight: 600 };

const STATUS_BADGE = {
  approved: badge('#DCF0E6', '#1E8F63'),
  pending: badge('#FBEACC', '#C1780F'),
  rejected: badge('#FAE0E2', '#D6323F'),
};
const STATUS_LABEL = { approved: 'Aprovado', pending: 'Pendente', rejected: 'Rejeitado' };

// Painel de administracao: lista todos os perfis e deixa aprovar/rejeitar/trocar
// papel. Toda alteracao passa pela funcao admin_update_profile() no banco, que
// confere de novo (no servidor) que quem esta chamando e admin — mesmo que
// alguem chegue nesta tela sem ser admin, o banco recusa a escrita.
export default function AdminUsers({ myId }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) setErr(error.message); else setRows(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function apply(id, status, role) {
    setBusyId(id); setErr('');
    const { error } = await supabase.rpc('admin_update_profile', { target_id: id, new_status: status, new_role: role });
    setBusyId(null);
    if (error) setErr(error.message); else load();
  }

  return (
    <div style={wrap}>
      <a href="/" style={backLink}>← Voltar para o app</a>
      <h1 style={{ ...h1, marginTop: 14 }}>Usuários</h1>
      <p style={sub}>Aprove novos cadastros e defina quem é administrador (edita tudo) ou convidado (só visualiza).</p>
      {err && <p style={{ color: '#D6323F', fontSize: 13 }}>{err}</p>}
      {!rows ? <p style={sub}>Carregando…</p> : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>E-mail</th>
              <th style={th}>Status</th>
              <th style={th}>Papel</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={td}>{r.email}{r.id === myId ? ' (você)' : ''}</td>
                <td style={td}><span style={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                <td style={td}>{r.role === 'admin' ? 'Administrador' : 'Convidado'}</td>
                <td style={td}>
                  {busyId === r.id ? <span style={sub}>salvando…</span> : (
                    <>
                      {r.status !== 'approved' && (
                        <button style={btn('#1E8F63', '#fff')} onClick={() => apply(r.id, 'approved', r.role)}>Aprovar</button>
                      )}
                      {r.status !== 'rejected' && (
                        <button style={btn('#FAE0E2', '#D6323F')} onClick={() => apply(r.id, 'rejected', r.role)} disabled={r.id === myId}>Rejeitar</button>
                      )}
                      {r.role !== 'admin'
                        ? <button style={btn('#FBE9F4', '#B8156A')} onClick={() => apply(r.id, r.status, 'admin')}>Tornar admin</button>
                        : <button style={btn('#FBE9F4', '#B8156A')} onClick={() => apply(r.id, r.status, 'convidado')} disabled={r.id === myId}>Tornar convidado</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
