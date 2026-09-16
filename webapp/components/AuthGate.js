'use client';
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { supabaseConfigured } from '../lib/supabaseClient';

const wrap = {
  minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#FDF6FA', padding: '24px', fontFamily: "'Public Sans', system-ui, sans-serif",
};
const card = {
  width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '28px 26px',
  boxShadow: '0 8px 30px rgba(0,0,0,.08)', border: '1px solid #F1D3E5',
};
const h1 = { fontFamily: "'Fraunces', serif", fontSize: 22, margin: '0 0 6px', color: '#241220' };
const sub = { fontSize: 13, color: '#6B5566', margin: '0 0 20px' };
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#241220', margin: '14px 0 5px' };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #F1D3E5', fontSize: 14, fontFamily: 'inherit',
};
const btn = {
  width: '100%', marginTop: 20, padding: '11px 14px', borderRadius: 8, border: 'none',
  background: '#E01F7F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
const btnGhost = {
  width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid #F1D3E5',
  background: '#FBE9F4', color: '#B8156A', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
};
const errBox = { marginTop: 14, fontSize: 12.5, color: '#D6323F', background: '#FAE0E2', borderRadius: 8, padding: '9px 11px' };
const okBox = { marginTop: 14, fontSize: 12.5, color: '#1E8F63', background: '#DCF0E6', borderRadius: 8, padding: '9px 11px' };

function LoginSignup() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (mode === 'signup') {
      setMsg('Cadastro enviado! Confirme seu e-mail (se pedido) e aguarde um administrador aprovar seu acesso.');
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={h1}>🎭 Piquinzada · Torre de Controle</h1>
        <p style={sub}>{mode === 'login' ? 'Entre com sua conta.' : 'Crie sua conta — um administrador precisa aprovar antes de você ver os dados.'}</p>
        <form onSubmit={submit}>
          <label style={label}>E-mail</label>
          <input style={input} type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <label style={label}>Senha</label>
          <input style={input} type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} />
          <button style={btn} type="submit" disabled={busy}>{busy ? 'Aguarde…' : (mode === 'login' ? 'Entrar' : 'Criar conta')}</button>
        </form>
        <button style={btnGhost} onClick={()=>{ setMode(mode==='login'?'signup':'login'); setErr(''); setMsg(''); }}>
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
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
