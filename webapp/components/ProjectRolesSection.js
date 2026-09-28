'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const sub = { fontSize: 13, color: '#6B5566', margin: '0 0 20px' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #F1D3E5' };
const th = { textAlign: 'left', padding: '10px 12px', background: '#FBE9F4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6B5566' };
const td = { padding: '10px 12px', borderTop: '1px solid #F7E4EF', verticalAlign: 'middle' };
const badge = (bg, fg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: bg, color: fg });
const btn = (bg, fg) => ({ padding: '5px 10px', borderRadius: 6, border: 'none', background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 });
const select = { padding: '6px 9px', borderRadius: 6, border: '1px solid #F1D3E5', fontSize: 12.5, fontFamily: 'inherit' };

// Gerencia o papel de cada usuário DENTRO DE UM PROJETO ESPECÍFICO — permite que
// alguém seja administrador num domínio (ex.: Bateria Piquinzada) e convidado nos
// outros, sem mexer no papel global (profiles.role) dele. Uma exceção aqui manda
// SÓ naquele projeto; sem exceção, vale o papel global normalmente.
export default function ProjectRolesSection({ projects, myId }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [profiles, setProfiles] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setErr('');
    const [{ data: profs, error: e1 }, { data: ovr, error: e2 }] = await Promise.all([
      supabase.from('profiles').select('id,email,role,status').eq('status', 'approved').order('email', { ascending: true }),
      supabase.from('project_roles').select('user_id,role').eq('project_id', projectId),
    ]);
    if (e1) { setErr(e1.message); return; }
    if (e2) { setErr(e2.message); return; }
    setProfiles(profs);
    const map = {};
    (ovr || []).forEach((r) => { map[r.user_id] = r.role; });
    setOverrides(map);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function setRole(userId, role) {
    setBusyId(userId); setErr('');
    const { error } = await supabase.rpc('admin_set_project_role', { target_project: projectId, target_user: userId, new_role: role });
    setBusyId(null);
    if (error) setErr(error.message); else load();
  }

  async function clearOverride(userId) {
    setBusyId(userId); setErr('');
    const { error } = await supabase.rpc('admin_clear_project_role', { target_project: projectId, target_user: userId });
    setBusyId(null);
    if (error) setErr(error.message); else load();
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div>
      <p style={sub}>
        Defina quem é administrador <strong>só neste projeto</strong> — quem não tem exceção aqui usa o papel global normalmente.
        Isso deixa alguém administrar um domínio (ex.: a Bateria) sem virar administrador dos outros.
      </p>
      {projects.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <select style={select} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
          </select>
        </div>
      )}
      {err && <p style={{ color: '#D6323F', fontSize: 13 }}>{err}</p>}
      {!profiles ? <p style={sub}>Carregando…</p> : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>E-mail</th>
              <th style={th}>Papel global</th>
              <th style={th}>Papel em {selectedProject?.label || 'este projeto'}</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const override = overrides[p.id];
              const effective = override || p.role;
              // se o único acesso de admin dela a este projeto vier da exceção (papel global não é
              // admin), remover essa exceção ou virar convidado aqui a tiraria do próprio projeto —
              // trava só esse caso pra não deixar ninguém se trancar fora sem outro admin por perto
              const selfLockout = p.id === myId && effective === 'admin' && p.role !== 'admin';
              return (
                <tr key={p.id}>
                  <td style={td}>{p.email}{p.id === myId ? ' (você)' : ''}</td>
                  <td style={td}>{p.role === 'admin' ? 'Administrador' : 'Convidado'}</td>
                  <td style={td}>
                    <span style={effective === 'admin' ? badge('#DCF0E6', '#1E8F63') : badge('#FBE9F4', '#6B5566')}>
                      {effective === 'admin' ? 'Administrador' : 'Convidado'}
                    </span>
                    {override && <span style={{ fontSize: 11, color: '#C1780F', marginLeft: 6 }}>(exceção)</span>}
                  </td>
                  <td style={td}>
                    {busyId === p.id ? <span style={sub}>salvando…</span> : (
                      <>
                        {effective !== 'admin' && (
                          <button style={btn('#1E8F63', '#fff')} onClick={() => setRole(p.id, 'admin')}>Tornar admin aqui</button>
                        )}
                        {effective !== 'convidado' && (
                          <button style={btn('#FBE9F4', '#B8156A')} onClick={() => setRole(p.id, 'convidado')} disabled={selfLockout} title={selfLockout ? 'Isso tiraria seu próprio acesso de admin a este projeto' : undefined}>Tornar convidado aqui</button>
                        )}
                        {override && (
                          <button style={btn('#F7E4EF', '#6B5566')} onClick={() => clearOverride(p.id)} disabled={selfLockout} title={selfLockout ? 'Isso tiraria seu próprio acesso de admin a este projeto' : undefined}>Usar papel global</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
