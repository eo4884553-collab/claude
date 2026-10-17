'use client';
import { useState } from 'react';
import { useAuth } from '../../lib/useAuth';
import { supabaseConfigured } from '../../lib/supabaseClient';
import { wrap, card, h1, sub, label, input, btn, btnGhost, errBox, okBox } from '../../lib/authCardStyles';

const linkBtn = { ...btnGhost, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' };

// chegada depois de clicar no link de "Esqueci minha senha" do e-mail — o cliente do Supabase já
// lê o token que vem na própria URL e estabelece uma sessão sozinho (detectSessionInUrl, ligado
// por padrão), então aqui só precisamos conferir se existe sessão (link válido) e deixar a pessoa
// definir uma senha nova. Link expirado/inválido ou acesso direto (sem vir do e-mail) = sem sessão.
export default function ResetPasswordPage() {
  const { session, resetPasswordForEmail, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function submitNewPassword(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (password.length < 6) { setErr('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (password !== confirm) { setErr('As senhas não são iguais.'); return; }
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('Senha alterada! Já pode voltar e entrar com a senha nova.');
  }

  async function submitRequestLink(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    const { error } = await resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('Se esse e-mail tiver uma conta cadastrada, enviamos um link novo. Confira sua caixa de entrada (e o spam).');
  }

  if (!supabaseConfigured) {
    return <div style={wrap}><div style={card}>
      <h1 style={h1}>Configuração pendente</h1>
      <p style={sub}>As variáveis do Supabase ainda não foram definidas neste ambiente.</p>
    </div></div>;
  }

  if (session === undefined) {
    return <div style={wrap}><div style={card}>
      <h1 style={h1}>Um instante…</h1>
      <p style={sub}>Conferindo seu link de recuperação.</p>
    </div></div>;
  }

  if (!session) {
    return <div style={wrap}><div style={card}>
      <h1 style={h1}>Link inválido ou expirado</h1>
      <p style={sub}>Esse link de recuperação não é mais válido (links expiram depois de um tempo). Peça um novo informando seu e-mail abaixo.</p>
      <form onSubmit={submitRequestLink}>
        <label style={label}>E-mail</label>
        <input style={input} type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
        <button style={btn} type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Enviar link de recuperação'}</button>
      </form>
      <a href="/" style={{ ...linkBtn, marginTop: 10 }}>Voltar pro login</a>
      {err && <div style={errBox}>{err}</div>}
      {msg && <div style={okBox}>{msg}</div>}
    </div></div>;
  }

  return <div style={wrap}><div style={card}>
    <h1 style={h1}>🎭 Definir nova senha</h1>
    <p style={sub}>Escolha uma senha nova pra sua conta.</p>
    {msg ? (
      <>
        <div style={okBox}>{msg}</div>
        <a href="/" style={{ ...linkBtn, marginTop: 14 }}>Ir para o login</a>
      </>
    ) : (
      <form onSubmit={submitNewPassword}>
        <label style={label}>Senha nova</label>
        <input style={input} type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" />
        <label style={label}>Confirmar senha nova</label>
        <input style={input} type="password" required minLength={6} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" />
        <button style={btn} type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar senha nova'}</button>
      </form>
    )}
    {err && <div style={errBox}>{err}</div>}
  </div></div>;
}
