'use client';
import { useData } from '../../lib/data';
import { dec } from '../../lib/stats';
import Ranking from '../../components/Ranking';
import { Vazio } from '../../components/ui';

export default function Goleiros() {
  const { stats, ano } = useData();
  const lista = stats.goleiros;
  if (!lista.length) return <Vazio ic="🧤">Nenhum goleiro lançado em {ano}.</Vazio>;
  return (
    <>
      <div className="pg-tit">
        <h1>Goleiros {ano}</h1>
        <p>Menor média de gols sofridos pelo time em que o goleiro jogou.</p>
      </div>
      <Ranking
        linhas={lista}
        posicao={(s) => lista.indexOf(s) + 1}
        sub={(s) => `${s.v}V ${s.e}E ${s.d}D`}
        colunas={[
          { rot: 'J', val: (s) => s.jogos },
          { rot: 'GS', val: (s) => s.sofridos },
          { rot: 'Média', val: (s) => dec(s.mediaSofridos), forte: true },
        ]}
        resumoBusca={(s) => <><b>{s.nome}</b> sofreu {s.sofridos} gol(s) em {s.jogos} jogo(s) — média {dec(s.mediaSofridos)}.</>}
      />
    </>
  );
}
