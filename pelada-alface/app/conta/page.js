'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { supabase } from '../../lib/supabaseClient';
import LoginScreen from '../../components/LoginScreen';

export default function Conta() {
  const auth = useAuth();
  const { raw } = useData();
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(null);

  if (auth.guest) return <LoginScreen />;

  const p = auth.profile;
  const meu = raw.players.find((x) => x.id === p.player_id);

  async function vincular(id) {
    const { error } = await supabase.rpc('set_my_player', { new_player_id: id || null });
    if (error) setMsg({ erro: error.message }); else { auth.refreshProfile(); setMsg({ ok: 'Vínculo atualizado.' }); }
  }
  async function trocarSenha(e) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setMsg(error ? { erro: error.message } : { ok: 'Senha alterada!' });
    if (!error) setSenha('');
  }

  return (
    <>
      <div className="pg-tit"><h1>Minha conta</h1><p>{p.email}</p></div>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Seu acesso: <b>{p.role === 'admin' ? '🛠️ Administrador' : '👀 Convidado (só visualiza)'}</b>
        </p>
        {p.role === 'admin'
          ? <Link className="btn claro" href="/admin">Ir para lançamentos</Link>
          : <p className="muted peq" style={{ margin: 0 }}>Para lançar partidas, peça a um administrador para liberar seu acesso.</p>}
      </div>
      <div className="card">
        <label className="campo"><span>Qual atleta é você? (destaca sua posição nos rankings)</span>
          <select value={meu?.id || ''} onChange={(e) => vincular(e.target.value)}>
            <option value="">— não vincular —</option>
            {[...raw.players].sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
      </div>
      <form className="card" onSubmit={trocarSenha}>
        <label className="campo"><span>Nova senha</span>
          <input type="password" minLength={6} required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </label>
        <button className="btn">Alterar senha</button>
      </form>
      {msg?.erro && <div className="erro">{msg.erro}</div>}
      {msg?.ok && <div className="ok">{msg.ok}</div>}
      <button className="btn perigo bloco" style={{ marginTop: 16 }} onClick={auth.signOut}>Sair</button>
    </>
  );
}
