'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useData } from '../../../lib/data';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabaseClient';
import { dataBR, dec, pct } from '../../../lib/stats';
import { Avatar, Cartoes, Forma, Vazio } from '../../../components/ui';

export default function Jogador() {
  const { id } = useParams();
  const { raw, stats, ano } = useData();
  const { user, myPlayerId, refreshProfile } = useAuth();
  const p = raw.players.find((x) => x.id === id);
  if (!p) return <Vazio>Atleta não encontrado.</Vazio>;
  const s = stats.porId.get(id);
  const g = stats.goleirosPorId.get(id);
  const lider = s && s.posAprov === 1;

  async function souEu() {
    await supabase.rpc('set_my_player', { new_player_id: myPlayerId === id ? null : id });
    refreshProfile();
  }

  const historico = [...(s?.historico || []), ...(g?.historico || [])].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <>
      <div className={`figurinha ${lider ? 'ouro' : ''}`}>
        <img className="marca" src="/logo-transparente.png" alt="" />
        <div className="topo-f">
          <Avatar nome={p.nome} grande medalha={lider ? 'ouro' : undefined} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {lider && <span className="tag ouro">👑 Líder em aproveitamento</span>}
            <h1>{p.nome}</h1>
            <span className="peq" style={{ opacity: .85 }}>{p.goleiro ? 'Goleiro' : 'Linha'} · temporada {ano}</span>
          </div>
          {s && <div className="ovr">{pct(s.aprov)}<small>APROV.</small></div>}
        </div>
        {s ? (
          <div className="stats">
            <div><b>{s.jogos}</b><span>Jogos</span></div>
            <div><b>{s.gols}</b><span>Gols</span></div>
            <div><b>{dec(s.media)}</b><span>Média gols</span></div>
            <div><b>{s.v}</b><span>Vitórias</span></div>
            <div><b>{s.e}</b><span>Empates</span></div>
            <div><b>{s.d}</b><span>Derrotas</span></div>
          </div>
        ) : g ? (
          <div className="stats">
            <div><b>{g.jogos}</b><span>Jogos no gol</span></div>
            <div><b>{g.sofridos}</b><span>Gols sofridos</span></div>
            <div><b>{dec(g.mediaSofridos)}</b><span>Média</span></div>
          </div>
        ) : <p>Sem jogos em {ano}.</p>}
      </div>

      {s && (
        <div className="grid2" style={{ marginTop: 14 }}>
          <Link href="/ranking" className="card destaque">
            <span className="rot">Aproveitamento</span>
            <span className="val">{s.posAprov ? `${s.posAprov}º` : '—'}</span>
            <span className="muted peq">{s.posAprov ? `de ${stats.classificados.length} · ${s.ganhos}/${s.disputados} pts` : `precisa de ${stats.minJogos} jogos`}</span>
          </Link>
          <Link href="/artilharia" className="card destaque">
            <span className="rot">Artilharia</span>
            <span className="val">{s.posArt ? `${s.posArt}º` : '—'}</span>
            <span className="muted peq">{s.gols} gol(s)</span>
          </Link>
          <div className="card destaque">
            <span className="rot">Últimos jogos</span>
            <Forma historico={s.historico} />
          </div>
          <div className="card destaque">
            <span className="rot">Cartões</span>
            {s.amarelos || s.vermelhos ? <Cartoes am={s.amarelos} vm={s.vermelhos} /> : <span className="muted peq">Nenhum 🤝</span>}
          </div>
        </div>
      )}

      {user && (
        <button className={`btn ${myPlayerId === id ? 'linha' : 'claro'} bloco`} style={{ marginTop: 14 }} onClick={souEu}>
          {myPlayerId === id ? 'Este é você ✓ (toque para desvincular)' : '🙋 Este sou eu — destacar minha posição'}
        </button>
      )}

      <div className="sec-tit"><h2>Jogos em {ano}</h2></div>
      <div className="card" style={{ padding: 0 }}>
        <table className="tabela-simples">
          <thead><tr><th style={{ paddingLeft: 14 }}>Data</th><th>Time</th><th>Placar</th><th>Res.</th><th>Gols</th></tr></thead>
          <tbody>
            {historico.map((h, i) => (
              <tr key={i}>
                <td style={{ paddingLeft: 14 }}>{dataBR(h.data, { day: '2-digit', month: '2-digit' })}</td>
                <td><span className={`camisa ${h.time}`} style={{ display: 'inline-block', width: 14, height: 14, verticalAlign: -2 }} /> {h.goleiro ? '🧤' : ''}</td>
                <td>{h.placar.branco} × {h.placar.verde}</td>
                <td><span className="forma"><i className={h.res}>{h.res}</i></span></td>
                <td>{h.gols ? '⚽'.repeat(Math.min(h.gols, 3)) + (h.gols > 3 ? h.gols : '') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!historico.length && <div className="vazio">Sem jogos nesta temporada.</div>}
      </div>
    </>
  );
}
