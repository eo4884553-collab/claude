'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar, Busca, normaliza } from './ui';

// tabela de ranking genérica: colunas = [{rot, val(s), forte?}]
// - a busca filtra mas mantém a posição real de cada atleta
// - 1º/2º/3º recebem destaque de medalha; o "meu jogador" fica marcado
export default function Ranking({ linhas, colunas, posicao, sub, separador, resumoBusca }) {
  const [q, setQ] = useState('');
  const { myPlayerId } = useAuth();
  const termo = normaliza(q);
  const filtrar = (arr) => (termo ? arr.filter((s) => normaliza(s.nome).includes(termo)) : arr);
  const visiveis = useMemo(() => filtrar(linhas), [linhas, termo]); // eslint-disable-line react-hooks/exhaustive-deps
  const visSep = separador ? filtrar(separador.linhas) : [];
  const exato = termo && [...linhas, ...(separador?.linhas || [])].find((s) => normaliza(s.nome) === termo)
    || (visiveis.length + visSep.length === 1 ? visiveis[0] || visSep[0] : null);

  const linha = (s, i, semPos) => {
    const pos = semPos ? null : posicao(s, i);
    const cls = ['rank-lin', !semPos && pos <= 3 && `p${pos}`, s.id === myPlayerId && 'eu', termo && 'alvo'].filter(Boolean).join(' ');
    return (
      <Link key={s.id + (semPos ? '-b' : '')} href={`/jogador/${s.id}`} className={cls}>
        <span className="pos">{pos ?? '–'}</span>
        <span className="quem">
          <Avatar nome={s.nome} medalha={!semPos && pos <= 3 ? ['ouro', 'prata', 'bronze'][pos - 1] : undefined} />
          <span style={{ minWidth: 0 }}>
            <b>{s.nome}{s.id === myPlayerId && <span className="tag">você</span>}</b>
            {sub && <small>{sub(s)}</small>}
          </span>
        </span>
        {colunas.map((c) => <span key={c.rot} className={`c ${c.forte ? 'forte' : ''}`}>{c.val(s)}</span>)}
      </Link>
    );
  };

  return (
    <>
      <Busca valor={q} onChange={setQ} />
      {exato && resumoBusca && <div className="achado">{resumoBusca(exato)}</div>}
      <div className="rank" style={{ '--cols': colunas.length }}>
        <div className="rank-cab">
          <span>#</span><span>Atleta</span>
          {colunas.map((c) => <span key={c.rot}>{c.rot}</span>)}
        </div>
        {visiveis.map((s, i) => linha(s, i))}
        {separador && visSep.length > 0 && (
          <>
            <div className="sep-rank">{separador.titulo}</div>
            {visSep.map((s, i) => linha(s, i, true))}
          </>
        )}
        {!visiveis.length && !visSep.length && <div className="vazio">Nenhum atleta encontrado com “{q}”.</div>}
      </div>
    </>
  );
}
