'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { supabaseConfigured } from '../lib/supabaseClient';
import LoginScreen from './LoginScreen';
import { Carregando } from './ui';

const ABERTAS = ['/login', '/redefinir-senha'];

const PRINCIPAIS = [
  { href: '/', ic: '🏠', txt: 'Início' },
  { href: '/ranking', ic: '📈', txt: 'Ranking' },
  { href: '/artilharia', ic: '⚽', txt: 'Artilharia' },
  { href: '/partidas', ic: '📅', txt: 'Partidas' },
];
const EXTRAS = [
  { href: '/cartoes', ic: '🟨', txt: 'Cartões' },
  { href: '/goleiros', ic: '🧤', txt: 'Goleiros' },
  { href: '/sorteio', ic: '🎲', txt: 'Sorteio de times' },
];

export default function Shell({ children }) {
  const path = usePathname();
  const auth = useAuth();
  const data = useData();
  const [mais, setMais] = useState(false);

  if (ABERTAS.includes(path)) return children;
  if (!supabaseConfigured) {
    return (
      <div className="login-bg"><div className="login-card">
        <img className="logo" src="/logo.png" alt="" />
        <h1>Configuração pendente</h1>
        <p className="sub">Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja o README).</p>
      </div></div>
    );
  }
  if (auth.loading) return <Carregando tela />;
  if (!auth.canView) return <LoginScreen />;

  const on = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const extras = [
    ...EXTRAS,
    ...(auth.isAdmin ? [{ href: '/admin', ic: '🛠️', txt: 'Administração (lançamentos)' }] : []),
    { href: '/conta', ic: '👤', txt: auth.guest ? 'Entrar / criar conta' : 'Minha conta' },
  ];

  return (
    <>
      <header className="topo">
        <div className="topo-in">
          <Link href="/"><img className="topo-logo" src="/logo.png" alt="Amigos do Alface" /></Link>
          <div className="topo-tit">
            <b>Amigos do Alface</b>
            <span>Pelada de sábado · desde 1997</span>
          </div>
          <nav className="nav-desk">
            {[...PRINCIPAIS, ...EXTRAS].map((l) => (
              <Link key={l.href} href={l.href} className={on(l.href) ? 'on' : ''}>{l.txt.split(' ')[0]}</Link>
            ))}
            {auth.isAdmin && <Link href="/admin" className={on('/admin') ? 'on' : ''}>Admin</Link>}
            <Link href="/conta" className={on('/conta') ? 'on' : ''}>👤</Link>
          </nav>
          {data.anos.length > 0 && (
            <select
              className="temporada"
              aria-label="Temporada"
              value={data.ano}
              onChange={(e) => data.setAno(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            >
              {data.anos.map((a) => <option key={a} value={a}>{a}</option>)}
              {data.anos.length > 1 && <option value="todas">Todas</option>}
            </select>
          )}
        </div>
      </header>

      <main className="conteudo">
        {data.error ? <div className="erro">Não foi possível carregar os dados: {data.error}</div>
          : data.loading ? <Carregando /> : children}
      </main>

      <nav className="nav-mob">
        {PRINCIPAIS.map((l) => (
          <Link key={l.href} href={l.href} className={on(l.href) ? 'on' : ''}>
            <span className="ic">{l.ic}</span>{l.txt}
          </Link>
        ))}
        <button className={extras.some((l) => on(l.href)) ? 'on' : ''} onClick={() => setMais(true)}>
          <span className="ic">☰</span>Mais
        </button>
      </nav>

      {mais && (
        <>
          <div className="folha-fundo" onClick={() => setMais(false)} />
          <div className="folha" onClick={() => setMais(false)}>
            <div className="alca" />
            {extras.map((l) => (
              <Link key={l.href} href={l.href}><span>{l.ic}</span>{l.txt}</Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
