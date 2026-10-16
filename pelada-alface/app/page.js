'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useData } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dataBR, dec, pct, proximoSabado } from '../lib/stats';
import { Avatar, Forma, Vazio } from '../components/ui';
import CartaoPartida from '../components/CartaoPartida';

// só para o dono: avisa quando tem gente esperando aprovação
function AvisoPendentes() {
  const [n, setN] = useState(0);
  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
      .then(({ count }) => setN(count || 0));
  }, []);
  if (!n) return null;
  return (
    <Link href="/admin?aba=usuarios" className="achado" style={{ display: 'block', marginBottom: 14 }}>
      ⏳ <b>{n} cadastro{n > 1 ? 's' : ''}</b> aguardando sua aprovação — toque para ver ›
    </Link>
  );
}

export default function Inicio() {
  const { stats, ano } = useData();
  const { myPlayerId, profile, isDono } = useAuth();
  if (!stats.partidas.length) {
    return <Vazio>Nenhuma partida lançada em {ano} ainda.</Vazio>;
  }
  const lider = stats.classificados[0];
  const art = stats.artilharia[0];
  const pres = stats.presenca[0];
  const gk = stats.goleiros.find((g) => g.jogos >= 2) || stats.goleiros[0];
  const eu = myPlayerId && stats.porId.get(myPlayerId);
  const prox = proximoSabado();

  return (
    <>
      {isDono && <AvisoPendentes />}
      {lider && (
        <Link href={`/jogador/${lider.id}`} className="heroi" style={{ display: 'block' }}>
          <span className="selo">👑 Craque do aproveitamento {ano}</span>
          <div className="linha">
            <div>
              <div className="nome">{lider.nome}</div>
              <Forma historico={lider.historico} />
            </div>
            <div className="num">{pct(lider.aprov)}</div>
          </div>
          <div className="mini">
            <span><b>{lider.jogos}</b>jogos</span>
            <span><b>{lider.v}</b>vitórias</span>
            <span><b>{lider.e}</b>empates</span>
            <span><b>{lider.d}</b>derrotas</span>
            <span><b>{lider.ganhos}/{lider.disputados}</b>pontos</span>
          </div>
        </Link>
      )}

      {eu && (
        <Link href={`/jogador/${eu.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <Avatar nome={eu.nome} />
          <div style={{ flex: 1 }}>
            <b>Olá, {profile?.nome || eu.nome}!</b>
            <div className="muted peq">
              {eu.posAprov ? `${eu.posAprov}º no aproveitamento (${pct(eu.aprov)})` : `Faltam ${stats.minJogos - eu.jogos} jogo(s) para entrar no ranking`}
              {eu.posArt ? ` · ${eu.posArt}º na artilharia` : ''}
            </div>
          </div>
          <span>›</span>
        </Link>
      )}

      <div className="sec-tit"><h2>Destaques {ano}</h2></div>
      <div className="grid4">
        {art && (
          <Link href="/artilharia" className="card destaque">
            <span className="ic">⚽</span><span className="rot">Artilheiro</span>
            <span className="nome">{art.nome}</span><span className="val">{art.gols} <small style={{ fontSize: 14 }}>gols</small></span>
          </Link>
        )}
        {pres && (
          <Link href={`/jogador/${pres.id}`} className="card destaque">
            <span className="ic">🔥</span><span className="rot">Mais presente</span>
            <span className="nome">{pres.nome}</span><span className="val">{pres.jogos} <small style={{ fontSize: 14 }}>jogos</small></span>
          </Link>
        )}
        {gk && (
          <Link href="/goleiros" className="card destaque">
            <span className="ic">🧤</span><span className="rot">Goleiro menos vazado</span>
            <span className="nome">{gk.nome}</span><span className="val">{dec(gk.mediaSofridos)} <small style={{ fontSize: 14 }}>gols/jogo</small></span>
          </Link>
        )}
        <div className="card destaque">
          <span className="ic">📊</span><span className="rot">Temporada</span>
          <span className="nome">{stats.partidas.length} rodadas</span>
          <span className="val">{stats.totalGols} <small style={{ fontSize: 14 }}>gols ({dec(stats.totalGols / stats.partidas.length)}/jogo)</small></span>
        </div>
      </div>

      <div className="sec-tit"><h2>Última rodada</h2><Link href="/partidas">Todas ›</Link></div>
      <CartaoPartida partida={stats.partidas[0]} />

      <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>📆</span>
        <div>
          <b>Próxima pelada: sábado, {prox.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</b>
          <div className="muted peq">Bora! Use o <Link href="/sorteio" style={{ color: 'var(--verde)', fontWeight: 700 }}>sorteio equilibrado</Link> para montar Branco x Verde.</div>
        </div>
      </div>
      <p className="muted peq" style={{ textAlign: 'center', marginTop: 18 }}>
        Atualizado com a rodada de {dataBR(stats.partidas[0].data)}
      </p>
    </>
  );
}
