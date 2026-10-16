'use client';
import Link from 'next/link';

export function Carregando({ tela }) {
  const el = (
    <div className="carregando">
      <div>
        <img className="bola-gira" src="/logo.png" alt="" />
        Carregando…
      </div>
    </div>
  );
  return tela ? <div style={{ minHeight: '100dvh', display: 'grid' }}>{el}</div> : el;
}

export function iniciais(nome = '') {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || p[0]?.[1] || '')).toUpperCase();
}

const CORES = ['#109246', '#0a6331', '#1f7a5c', '#2b8a3e', '#16794a', '#3a7d44', '#0f5f3a'];
export function Avatar({ nome, medalha, grande }) {
  const cor = CORES[[...nome].reduce((t, c) => t + c.charCodeAt(0), 0) % CORES.length];
  const cls = ['av', grande && 'g', medalha].filter(Boolean).join(' ');
  return <span className={cls} style={medalha ? undefined : { background: cor }}>{iniciais(nome)}</span>;
}

const MEDALHAS = ['ouro', 'prata', 'bronze'];
// pódio dos 3 primeiros: 2º à esquerda, 1º no meio (mais alto), 3º à direita
export function Podio({ itens, valor, rotulo }) {
  if (itens.length < 3) return null;
  const ordem = [itens[1], itens[0], itens[2]];
  const classe = ['d2', 'd1', 'd3'];
  const pos = [2, 1, 3];
  return (
    <div className="podio">
      {ordem.map((s, i) => (
        <Link key={s.id} href={`/jogador/${s.id}`} className={`degrau ${classe[i]}`}>
          {pos[i] === 1 && <span className="coroa">👑</span>}
          <Avatar nome={s.nome} medalha={MEDALHAS[pos[i] - 1]} grande={pos[i] === 1} />
          <div className="n">{s.nome}</div>
          <div className="base">
            <span className="p">{pos[i]}º</span>
            <span className="v">{valor(s)} {rotulo}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function Busca({ valor, onChange, placeholder = 'Buscar atleta pelo nome…' }) {
  return (
    <div className="busca">
      <span className="lupa">🔎</span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search" />
    </div>
  );
}

export const normaliza = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

export function Forma({ historico, n = 5 }) {
  const ult = [...historico].sort((a, b) => b.data.localeCompare(a.data)).slice(0, n).reverse();
  return <span className="forma">{ult.map((h, i) => <i key={i} className={h.res}>{h.res}</i>)}</span>;
}

export function Cartoes({ am = 0, vm = 0 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {am > 0 && <><span className="cartao am" />{am}</>}
      {vm > 0 && <><span className="cartao vm" />{vm}</>}
    </span>
  );
}

export function Vazio({ ic = '⚽', children }) {
  return <div className="card vazio"><span className="grande">{ic}</span>{children}</div>;
}
