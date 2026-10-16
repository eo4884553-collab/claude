'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { supabase } from '../../lib/supabaseClient';
import LancarPartida from '../../components/LancarPartida';
import { Busca, Vazio, normaliza } from '../../components/ui';

function Jogadores() {
  const { raw, stats, reload } = useData();
  const [q, setQ] = useState('');
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState('');
  const lista = [...raw.players].sort((a, b) => a.nome.localeCompare(b.nome))
    .filter((p) => !q || normaliza(p.nome).includes(normaliza(q)));

  async function exec(p) {
    setErro('');
    const { error } = await p;
    if (error) setErro(error.code === '23505' ? 'Já existe um atleta com esse nome.' : error.code === '23503' ? 'Este atleta tem jogos lançados; desative em vez de excluir.' : error.message);
    else reload();
  }
  const upd = (id, campos) => exec(supabase.from('players').update(campos).eq('id', id));

  return (
    <>
      <form className="card" style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (novo.trim()) { exec(supabase.from('players').insert({ nome: novo.trim().toUpperCase() })); setNovo(''); } }}>
        <input className="inp" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo atleta" />
        <button className="btn">Adicionar</button>
      </form>
      {erro && <div className="erro">{erro}</div>}
      <div style={{ marginTop: 14 }}><Busca valor={q} onChange={setQ} /></div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <table className="tabela-simples">
          <thead><tr><th>Nome (toque para renomear)</th><th>Jogos</th><th>Goleiro</th><th>Ativo</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => {
              const j = (stats.porId.get(p.id)?.jogos || 0) + (stats.goleirosPorId.get(p.id)?.jogos || 0);
              return (
                <tr key={p.id}>
                  <td><input className="inp" style={{ padding: '6px 8px' }} defaultValue={p.nome}
                    onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (v && v !== p.nome) upd(p.id, { nome: v }); }} /></td>
                  <td>{j}</td>
                  <td><input type="checkbox" checked={p.goleiro} onChange={(e) => upd(p.id, { goleiro: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={p.ativo} onChange={(e) => upd(p.id, { ativo: e.target.checked })} /></td>
                  <td>{!raw.matchPlayers.some((l) => l.player_id === p.id) && (
                    <button className="btn perigo peq" onClick={() => confirm(`Excluir ${p.nome}?`) && exec(supabase.from('players').delete().eq('id', p.id))}>✕</button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Usuarios() {
  const { raw } = useData();
  const { user, profile } = useAuth();
  const souDono = !!profile?.dono;
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = () => supabase.from('profiles').select('*').order('created_at').then(({ data, error }) => { setLista(data || []); if (error) setErro(error.message); });
  useEffect(() => { carregar(); }, []);

  async function salvar(p, campos) {
    setErro('');
    const n = { ...p, ...campos };
    const { error } = await supabase.rpc('admin_update_profile', { target_id: p.id, new_role: n.role, new_player_id: n.player_id || null });
    if (error) setErro(error.message); else carregar();
  }
  if (!lista) return null;
  return (
    <>
      <p className="muted peq">
        Todo cadastro novo entra como <b>Convidado</b> (só visualiza).{' '}
        {souDono ? 'Promova aqui quem pode lançar partidas.' : 'Só o dono do app pode mudar quem é administrador.'}
      </p>
      {erro && <div className="erro">{erro}</div>}
      {lista.map((p) => (
        <div key={p.id} className="card" style={{ display: 'grid', gap: 8 }}>
          <div>
            <b>{p.nome || p.email}</b>
            {p.dono && <span className="tag ouro">👑 dono</span>}
            {p.id === user.id && <span className="tag">você</span>}
            <div className="muted peq">{p.email}</div>
          </div>
          <div className="grid2">
            {souDono && !p.dono ? (
              <select className="inp" value={p.role} onChange={(e) => salvar(p, { role: e.target.value })}>
                <option value="convidado">👀 Convidado</option>
                <option value="admin">🛠️ Administrador</option>
              </select>
            ) : (
              <span className="inp" style={{ background: '#f6faf7' }}>{p.role === 'admin' ? '🛠️ Administrador' : '👀 Convidado'}</span>
            )}
            <select className="inp" value={p.player_id || ''} onChange={(e) => salvar(p, { player_id: e.target.value })}>
              <option value="">— atleta —</option>
              {[...raw.players].sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
        </div>
      ))}
    </>
  );
}

function Ajustes() {
  const { raw, stats, reload } = useData();
  const [msg, setMsg] = useState('');
  const atual = Number(raw.settings.min_jogos_pct);
  async function salvar(v) {
    const { error } = await supabase.from('settings').update({ min_jogos_pct: v }).eq('id', 'main');
    setMsg(error ? error.message : 'Salvo!');
    reload();
  }
  return (
    <div className="card">
      <label className="campo"><span>Mínimo de jogos para disputar o ranking de aproveitamento</span>
        <select value={atual} onChange={(e) => salvar(Number(e.target.value))}>
          {[0, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6].map((v) => <option key={v} value={v}>{Math.round(v * 100)}% das rodadas da temporada</option>)}
        </select>
      </label>
      <p className="muted peq">Hoje isso significa <b>{stats.minJogos} jogos</b> de {stats.partidas.length} rodadas. Evita que quem jogou 1 vez e ganhou fique em 1º.</p>
      {msg && <div className="ok">{msg}</div>}
    </div>
  );
}

function Admin() {
  const { isAdmin } = useAuth();
  const params = useSearchParams();
  const editar = params.get('editar');
  const [aba, setAba] = useState('lancar');
  useEffect(() => { if (editar) setAba('lancar'); }, [editar]);

  if (!isAdmin) return <Vazio ic="🔒">Área exclusiva dos administradores.</Vazio>;
  const ABAS = { lancar: editar ? '✏️ Editar rodada' : '➕ Lançar rodada', jogadores: '👥 Atletas', usuarios: '🔑 Usuários', ajustes: '⚙️ Ajustes' };
  return (
    <>
      <div className="pg-tit"><h1>Administração</h1><p>Lançamentos e cadastros. Tudo que for salvo aqui atualiza o app de todo mundo na hora.</p></div>
      <div className="chips">
        {Object.entries(ABAS).map(([k, t]) => <button key={k} className={`chip ${aba === k ? 'on' : ''}`} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      {aba === 'lancar' && <LancarPartida key={editar || 'nova'} editarId={editar} />}
      {aba === 'jogadores' && <Jogadores />}
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'ajustes' && <Ajustes />}
    </>
  );
}

export default function AdminPage() {
  return <Suspense fallback={null}><Admin /></Suspense>;
}
