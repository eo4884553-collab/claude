'use client';
import { useMemo, useState } from 'react';
import { useData } from '../../lib/data';
import { pct } from '../../lib/stats';
import Ranking from '../../components/Ranking';
import { Podio, Vazio } from '../../components/ui';

const ORDENS = {
  aprov: { rot: 'Aproveitamento', fn: null },
  jogos: { rot: 'Mais jogos', fn: (a, b) => b.jogos - a.jogos || b.aprov - a.aprov },
  v: { rot: 'Vitórias', fn: (a, b) => b.v - a.v || b.aprov - a.aprov },
  pts: { rot: 'Pontos', fn: (a, b) => b.ganhos - a.ganhos || b.aprov - a.aprov },
  pctv: { rot: '% Vitória', fn: (a, b) => b.pctVitoria - a.pctVitoria || b.jogos - a.jogos },
};

export default function RankingPage() {
  const { stats, ano } = useData();
  const [ordem, setOrdem] = useState('aprov');

  const { linhas, separador } = useMemo(() => {
    if (ordem === 'aprov') {
      return {
        linhas: stats.classificados,
        separador: { titulo: `Ainda sem o mínimo de ${stats.minJogos} jogos para disputar o aproveitamento`, linhas: stats.abaixo },
      };
    }
    return { linhas: [...stats.atletas].sort(ORDENS[ordem].fn), separador: null };
  }, [stats, ordem]);
  const posMap = useMemo(() => new Map(linhas.map((s, i) => [s.id, i + 1])), [linhas]);

  if (!stats.atletas.length) return <Vazio>Nenhuma partida em {ano}.</Vazio>;

  return (
    <>
      <div className="pg-tit">
        <h1>Ranking {ano}</h1>
        <p>Aproveitamento = pontos ganhos ÷ pontos disputados (vitória 3, empate 1). Para disputar é preciso ter jogado ao menos {stats.minJogos} das {stats.partidas.length} rodadas.</p>
      </div>
      <div className="chips">
        {Object.entries(ORDENS).map(([k, o]) => (
          <button key={k} className={`chip ${ordem === k ? 'on' : ''}`} onClick={() => setOrdem(k)}>{o.rot}</button>
        ))}
      </div>
      {ordem === 'aprov' && <Podio itens={linhas} valor={(s) => pct(s.aprov)} rotulo="" />}
      <Ranking
        linhas={linhas}
        separador={separador}
        posicao={(s) => posMap.get(s.id)}
        sub={(s) => `${s.v}V ${s.e}E ${s.d}D · ${s.gols} gol${s.gols === 1 ? '' : 's'}`}
        colunas={[
          { rot: 'J', val: (s) => s.jogos },
          { rot: 'Pts', val: (s) => s.ganhos },
          { rot: ordem === 'pctv' ? '%V' : 'Aprov', val: (s) => pct(ordem === 'pctv' ? s.pctVitoria : s.aprov), forte: true },
        ]}
        resumoBusca={(s) => {
          const p = posMap.get(s.id);
          if (!p) return <><b>{s.nome}</b> tem {s.jogos} jogo(s) e {pct(s.aprov)} de aproveitamento — faltam <b>{stats.minJogos - s.jogos}</b> jogo(s) para entrar no ranking.</>;
          return <><b>{s.nome}</b> está em <b>{p}º lugar</b> em {ORDENS[ordem].rot.toLowerCase()} — {s.jogos} jogos, {s.v}V {s.e}E {s.d}D, {s.ganhos}/{s.disputados} pontos ({pct(s.aprov)}).</>;
        }}
      />
    </>
  );
}
