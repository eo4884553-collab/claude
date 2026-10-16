'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/auth';

const MSG_ERRO = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Seu e-mail ainda não foi confirmado. Use "Reenviar e-mail de confirmação" abaixo.',
  'User already registered': 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci minha senha".',
};
const traduz = (m) => MSG_ERRO[m] || (/least 6/.test(m) ? 'A senha precisa ter pelo menos 6 caracteres.' : m);

export default function LoginScreen({ aposEntrar }) {
  const { enterAsGuest } = useAuth();
  const router = useRouter();
  const [modo, setModo] = useState('entrar'); // entrar | cadastrar | esqueci | reenviar
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const origem = typeof window !== 'undefined' ? window.location.origin : '';

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setOk(''); setBusy(true);
    const em = email.trim().toLowerCase();
    let res;
    if (modo === 'entrar') {
      res = await supabase.auth.signInWithPassword({ email: em, password: senha });
      if (!res.error && aposEntrar) aposEntrar();
    } else if (modo === 'cadastrar') {
      if (senha !== senha2) { setBusy(false); setErro('As senhas não conferem.'); return; }
      res = await supabase.auth.signUp({
        email: em, password: senha,
        options: { data: { nome: nome.trim() }, emailRedirectTo: origem },
      });
      if (!res.error) {
        setOk(res.data.session
          ? 'Conta criada! Você já está dentro.'
          : 'Conta criada! Enviamos um link de confirmação para o seu e-mail — clique nele e depois entre aqui.');
      }
    } else if (modo === 'esqueci') {
      res = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${origem}/redefinir-senha` });
      if (!res.error) setOk('Pronto! Se este e-mail tiver cadastro, você vai receber um link para criar uma nova senha. Confira também o spam.');
    } else {
      res = await supabase.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: origem } });
      if (!res.error) setOk('E-mail de confirmação reenviado. Confira a caixa de entrada e o spam.');
    }
    setBusy(false);
    if (res?.error) setErro(traduz(res.error.message));
  }

  const trocar = (m) => { setModo(m); setErro(''); setOk(''); };
  const titulo = { entrar: 'Entrar', cadastrar: 'Criar conta', esqueci: 'Esqueci minha senha', reenviar: 'Reenviar confirmação' }[modo];

  return (
    <div className="login-bg">
      <div className="login-card" style={{ marginTop: 70 }}>
        <img className="logo" src="/logo.png" alt="Amigos do Alface" />
        <h1>Amigos do Alface</h1>
        <p className="sub">Estatísticas da pelada de sábado · Vespasiano/MG</p>

        {(modo === 'entrar' || modo === 'cadastrar') ? (
          <div className="abas">
            <button className={modo === 'entrar' ? 'on' : ''} onClick={() => trocar('entrar')}>Entrar</button>
            <button className={modo === 'cadastrar' ? 'on' : ''} onClick={() => trocar('cadastrar')}>Criar conta</button>
          </div>
        ) : (
          <h2 style={{ fontSize: 20, marginBottom: 6, textTransform: 'uppercase' }}>{titulo}</h2>
        )}
        {modo === 'esqueci' && <p className="muted peq" style={{ marginTop: 0 }}>Informe seu e-mail e enviaremos um link para você criar uma nova senha.</p>}
        {modo === 'reenviar' && <p className="muted peq" style={{ marginTop: 0 }}>Não recebeu o e-mail de confirmação do cadastro? Enviamos de novo.</p>}

        <form onSubmit={enviar}>
          {modo === 'cadastrar' && (
            <label className="campo"><span>Nome / apelido na pelada</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="nickname" />
            </label>
          )}
          <label className="campo"><span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {(modo === 'entrar' || modo === 'cadastrar') && (
            <label className="campo"><span>Senha</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6}
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
            </label>
          )}
          {modo === 'cadastrar' && (
            <label className="campo"><span>Confirme a senha</span>
              <input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required minLength={6} autoComplete="new-password" />
            </label>
          )}
          <button className="btn bloco" disabled={busy}>
            {busy ? 'Aguarde…' : { entrar: 'Entrar', cadastrar: 'Criar minha conta', esqueci: 'Enviar link de nova senha', reenviar: 'Reenviar e-mail' }[modo]}
          </button>
        </form>

        {erro && <div className="erro">{erro}</div>}
        {ok && <div className="ok">{ok}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {modo !== 'esqueci' && <button className="link" onClick={() => trocar('esqueci')}>Esqueci minha senha</button>}
          {modo !== 'reenviar' && <button className="link" onClick={() => trocar('reenviar')}>Reenviar e-mail de confirmação</button>}
          {modo !== 'entrar' && modo !== 'cadastrar' && <button className="link" onClick={() => trocar('entrar')}>← Voltar para entrar</button>}
        </div>

        <div className="ou">ou</div>
        <button className="btn linha bloco" onClick={() => { enterAsGuest(); router.push('/'); }}>
          👀 Entrar como convidado (só visualizar)
        </button>
        <p className="muted peq" style={{ textAlign: 'center', marginBottom: 0 }}>
          Convidados veem rankings e partidas. Lançamentos são feitos só pelos administradores.
        </p>
      </div>
    </div>
  );
}
