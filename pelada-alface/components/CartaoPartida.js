'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dataBR } from '../lib/stats';
import { Cartoes } from './ui';

function Escalacao({ time, linhas, nomes }) {
  const ord = [...linhas].filter((l) => l.time === time)
    .sort((a, b) => a.goleiro - b.goleiro || b.gols - a.gols || nomes.get(a.player_id).localeCompare(nomes.get(b.player_id)));
  return (
    <div>
      <h4><span className={`camisa ${time}`} style={{ display: 'inline-block', width: 12, height: 12, verticalAlign: -1, marginRight: 6 }} />Time {time}</h4>
      <ul>
        {ord.map((l) => (
          <li key={l.id || l.player_id + l.time}>
            <Link href={`/jogador/${l.player_id}`}>{l.goleiro ? '🧤 ' : ''}{nomes.get(l.player_id)}</Link>
            <span>
              {l.gols > 0 && <span className="bola">{'⚽'.repeat(Math.min(l.gols, 4))}{l.gols > 4 ? `×${l.gols}` : ''}</span>}
              <Cartoes am={l.amarelos} vm={l.vermelhos} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CartaoPartida({ partida, abertaInicial }) {
  const [aberta, setAberta] = useState(!!abertaInicial);
  const { raw } = useData();
  const { isAdmin } = useAuth();
  const nomes = new Map(raw.players.map((p) => [p.id, p.nome]));
  const { branco, verde } = partida.placar;
  const extras = [
    partida.gols_extra_branco ? `${partida.gols_extra_branco} gol(s) sem autor/contra p/ Branco` : '',
    partida.gols_extra_verde ? `${partida.gols_extra_verde} gol(s) sem autor/contra p/ Verde` : '',
  ].filter(Boolean);

  return (
    <div className="card partida" onClick={() => setAberta(!aberta)}>
      <div className="data">
        <span>{dataBR(partida.data, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <span>{partida.linhas.length} atletas {aberta ? '▲' : '▼'}</span>
      </div>
      <div className="placar">
        <div className={`time ${branco > verde ? 'venceu' : ''}`}><span className="camisa branco" />Branco</div>
        <div className="gols"><span className={branco > verde ? 'venceu' : ''}>{branco}</span><span className="x">×</span><span className={verde > branco ? 'venceu' : ''}>{verde}</span></div>
        <div className={`time dir ${verde > branco ? 'venceu' : ''}`}>Verde<span className="camisa verde" /></div>
      </div>
      {aberta && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="escalacoes">
            <Escalacao time="branco" linhas={partida.linhas} nomes={nomes} />
            <Escalacao time="verde" linhas={partida.linhas} nomes={nomes} />
          </div>
          {extras.length > 0 && <p className="muted peq">⚠️ {extras.join(' · ')}</p>}
          {partida.observacoes && <p className="peq">📝 {partida.observacoes}</p>}
          <div className="linha-acoes" style={{ marginTop: 10 }}>
            {partida.foto_path && <a className="btn linha peq" href={partida.foto_path} target="_blank" rel="noreferrer">📷 Ver súmula</a>}
            {isAdmin && <Link className="btn claro peq" href={`/admin?editar=${partida.id}`}>✏️ Editar rodada</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
