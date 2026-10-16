'use client';
import { useData } from '../../lib/data';
import CartaoPartida from '../../components/CartaoPartida';
import { Vazio } from '../../components/ui';

export default function Partidas() {
  const { stats, ano } = useData();
  const p = stats.partidas;
  if (!p.length) return <Vazio>Nenhuma partida em {ano}.</Vazio>;
  const vb = p.filter((x) => x.placar.branco > x.placar.verde).length;
  const vv = p.filter((x) => x.placar.verde > x.placar.branco).length;
  return (
    <>
      <div className="pg-tit">
        <h1>Partidas {ano}</h1>
        <p>Toque numa rodada para ver as escalações, gols e cartões.</p>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="placar" style={{ marginTop: 0 }}>
          <div className="time"><span className="camisa branco" />Branco</div>
          <div className="gols" style={{ fontSize: 26 }}>{vb}<span className="x">vitórias</span>{vv}</div>
          <div className="time dir">Verde<span className="camisa verde" /></div>
        </div>
        <p className="muted peq" style={{ textAlign: 'center', margin: '6px 0 0' }}>{p.length - vb - vv} empates em {p.length} rodadas</p>
      </div>
      {p.map((x) => <CartaoPartida key={x.id} partida={x} />)}
    </>
  );
}
