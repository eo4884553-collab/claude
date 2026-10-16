'use client';
import { useData } from '../../lib/data';
import Ranking from '../../components/Ranking';
import { Vazio } from '../../components/ui';

export default function CartoesPage() {
  const { stats, ano } = useData();
  const lista = stats.cartoes;
  const am = lista.reduce((t, s) => t + s.amarelos, 0);
  const vm = lista.reduce((t, s) => t + s.vermelhos, 0);
  return (
    <>
      <div className="pg-tit">
        <h1>Cartões {ano}</h1>
        <p>Ordem: mais vermelhos, depois mais amarelos.</p>
      </div>
      <div className="grid2" style={{ marginBottom: 14 }}>
        <div className="card destaque"><span className="rot"><span className="cartao am" /> Amarelos</span><span className="val">{am}</span></div>
        <div className="card destaque"><span className="rot"><span className="cartao vm" /> Vermelhos</span><span className="val" style={{ color: 'var(--vermelho)' }}>{vm}</span></div>
      </div>
      {!lista.length ? (
        <Vazio ic="🤝">Temporada {ano} sem cartões até agora. Fair play total!</Vazio>
      ) : (
        <Ranking
          linhas={lista}
          posicao={(s, i) => lista.indexOf(s) + 1}
          sub={(s) => `${s.jogos} jogos`}
          colunas={[
            { rot: '🟨', val: (s) => s.amarelos },
            { rot: '🟥', val: (s) => s.vermelhos, forte: true },
          ]}
          resumoBusca={(s) => <><b>{s.nome}</b>: {s.amarelos} amarelo(s) e {s.vermelhos} vermelho(s) em {s.jogos} jogos.</>}
        />
      )}
    </>
  );
}
