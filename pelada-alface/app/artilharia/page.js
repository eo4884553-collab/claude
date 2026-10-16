'use client';
import { useData } from '../../lib/data';
import { dec } from '../../lib/stats';
import Ranking from '../../components/Ranking';
import { Podio, Vazio } from '../../components/ui';

export default function Artilharia() {
  const { stats, ano } = useData();
  if (!stats.artilharia.length) return <Vazio>Nenhum gol registrado em {ano}.</Vazio>;
  return (
    <>
      <div className="pg-tit">
        <h1>Artilharia {ano}</h1>
        <p>{stats.totalGols} gols em {stats.partidas.length} rodadas. Empate em gols: fica na frente quem jogou mais (igual à planilha).</p>
      </div>
      <Podio itens={stats.artilharia} valor={(s) => s.gols} rotulo="gols" />
      <Ranking
        linhas={stats.artilharia}
        posicao={(s) => s.posArt}
        sub={(s) => `${s.jogos} jogos`}
        colunas={[
          { rot: 'J', val: (s) => s.jogos },
          { rot: 'Média', val: (s) => dec(s.media) },
          { rot: 'Gols', val: (s) => s.gols, forte: true },
        ]}
        resumoBusca={(s) => <><b>{s.nome}</b> é o <b>{s.posArt}º artilheiro</b> com {s.gols} gol(s) em {s.jogos} jogos (média {dec(s.media)}).</>}
      />
    </>
  );
}
