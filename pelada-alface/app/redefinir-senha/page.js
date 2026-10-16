'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

// o link do e-mail "esqueci minha senha" abre aqui já com uma sessão temporária
// de recuperação; a pessoa só precisa escolher a senha nova.
export default function RedefinirSenha() {
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { if (data.session) setPronto(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      if (s && (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN')) setPronto(true);
    });
    const t = setTimeout(() => setPronto((p) => p || 'expirado'), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    if (senha !== senha2) { setErro('As senhas não conferem.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) setErro(error.message); else setOk(true);
  }

  return (
    <div className="login-bg">
      <div className="login-card" style={{ marginTop: 70 }}>
        <img className="logo" src="/logo.png" alt="" />
        <h1>Nova senha</h1>
        {ok ? (
          <>
            <div className="ok">Senha alterada com sucesso!</div>
            <Link href="/" className="btn bloco" style={{ marginTop: 14 }}>Ir para o app</Link>
          </>
        ) : pronto === 'expirado' ? (
          <>
            <p className="sub">Este link expirou ou já foi usado. Peça um novo na tela de entrada em “Esqueci minha senha”.</p>
            <Link href="/login" className="btn bloco">Voltar</Link>
          </>
        ) : !pronto ? (
          <p className="sub">Validando o link…</p>
        ) : (
          <form onSubmit={salvar}>
            <p className="sub">Escolha sua nova senha.</p>
            <label className="campo"><span>Nova senha</span>
              <input type="password" minLength={6} required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="campo"><span>Confirme a nova senha</span>
              <input type="password" minLength={6} required value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
            </label>
            <button className="btn bloco" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
            {erro && <div className="erro">{erro}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
