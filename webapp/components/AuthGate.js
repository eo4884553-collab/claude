'use client';
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { supabaseConfigured } from '../lib/supabaseClient';
import { wrap, card, h1, sub, label, input, btn, btnGhost, errBox, okBox } from '../lib/authCardStyles';

function LoginSignup() {
  const { signIn, signUp, resetPasswordForEmail } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    if (mode === 'forgot') {
      const { error } = await resetPasswordForEmail(email.trim());
      setBusy(false);
      if (error) { setErr(error.message); return; }
      // sempre mostra a mesma mensagem de sucesso, exista ou não essa conta — não dá pra revelar
      // pra quem está pedindo se um e-mail está cadastrado ou não
      setMsg('Se esse e-mail tiver uma conta cadastrada, enviamos um link pra você definir uma senha nova. Confira sua caixa de entrada (e o spam).');
      return;
    }
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (mode === 'signup') {
      setMsg('Cadastro enviado! Confirme seu e-mail (se pedido) e aguarde um administrador aprovar seu acesso.');
    }
  }

  function switchMode(next) {
    setMode(next); setErr(''); setMsg(''); setPassword('');
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={h1}>🎭 Piquinzada · Torre de Controle</h1>
        <p style={sub}>
          {mode === 'login' ? 'Entre com sua conta.'
            : mode === 'signup' ? 'Crie sua conta — um administrador precisa aprovar antes de você ver os dados.'
            : 'Informe o e-mail cadastrado — vamos enviar um link pra você definir uma senha nova.'}
        </p>
        <form onSubmit={submit}>
          <label style={label}>E-mail</label>
          <input style={input} type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          {mode !== 'forgot' && <>
            <label style={label}>Senha</label>
            <input style={input} type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} />
          </>}
          <button style={btn} type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : (mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação')}
          </button>
        </form>
        {mode === 'login' && (
          <button style={btnGhost} onClick={()=>switchMode('forgot')}>Esqueci minha senha</button>
        )}
        <button style={btnGhost} onClick={()=>switchMode(mode==='login'?'signup':'login')}>
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : mode === 'signup' ? 'Já tem conta? Entrar' : 'Voltar pro login'}
        </button>
        {err && <div style={errBox}>{err}</div>}
        {msg && <div style={okBox}>{msg}</div>}
      </div>
    </div>
  );
}

function StatusScreen({ title, text, showSignOut }) {
  const { signOut } = useAuth();
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={h1}>{title}</h1>
        <p style={sub}>{text}</p>
        {showSignOut && <button style={btnGhost} onClick={signOut}>Sair</button>}
      </div>
    </div>
  );
}

// Envolve a aplicacao inteira: mostra login/cadastro, tela de "aguardando
// aprovacao", ou libera o children (o app de verdade) quando aprovado.
export default function AuthGate({ children }) {
  const auth = useAuth();

  if (!supabaseConfigured) {
    return <StatusScreen title="Configuração pendente" text="As variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY ainda não foram definidas neste ambiente. Veja o README de implantação." />;
  }
  if (auth.loading) {
    return <StatusScreen title="Carregando…" text="Um instante." />;
  }
  if (!auth.session) {
    return <LoginSignup />;
  }
  if (!auth.profile) {
    return <StatusScreen title="Preparando sua conta…" text="Se isso não mudar em alguns segundos, recarregue a página." showSignOut />;
  }
  if (auth.profile.status === 'pending') {
    return <StatusScreen title="Aguardando aprovação" text={`Sua conta (${auth.profile.email}) foi criada e está aguardando um administrador aprovar o acesso.`} showSignOut />;
  }
  if (auth.profile.status === 'rejected') {
    return <StatusScreen title="Acesso não liberado" text="Um administrador não liberou o acesso desta conta a este projeto." showSignOut />;
  }
  return children(auth);
}
