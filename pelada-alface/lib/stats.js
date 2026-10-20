// Todas as contas do app num lugar só, nas mesmas regras da planilha:
//  - partida = 1 jogo para cada atleta escalado (goleiro fica no ranking de goleiros)
//  - placar = gols dos atletas + gols sem autor (gol contra) daquele time
//  - pontos disputados = jogos x 3; pontos ganhos = vitórias x 3 + empates
//  - aproveitamento = pontos ganhos / pontos disputados

export function placar(match, linhas) {
  let branco = match.gols_extra_branco || 0;
  let verde = match.gols_extra_verde || 0;
  for (const l of linhas) {
    if (l.time === 'branco') branco += l.gols || 0;
    else verde += l.gols || 0;
  }
  return { branco, verde };
}

export function resultadoDoTime(time, pl) {
  const meu = time === 'branco' ? pl.branco : pl.verde;
  const deles = time === 'branco' ? pl.verde : pl.branco;
  return meu > deles ? 'V' : meu < deles ? 'D' : 'E';
}

export function temporadas(matches) {
  const anos = [...new Set(matches.map((m) => Number(m.data.slice(0, 4))))].sort((a, b) => b - a);
  return anos.length ? anos : [new Date().getFullYear()];
}

// matches: [{id,data,gols_extra_*}], matchPlayers: [{match_id,player_id,time,goleiro,gols,amarelos,vermelhos}]
export function calcular({ players, matches, matchPlayers, ano, minJogosPct = 0.4 }) {
  const doAno = matches
    .filter((m) => ano === 'todas' || m.data.startsWith(String(ano)))
    .sort((a, b) => b.data.localeCompare(a.data));
  const ids = new Set(doAno.map((m) => m.id));
  const porPartida = new Map(doAno.map((m) => [m.id, []]));
  for (const l of matchPlayers) if (ids.has(l.match_id)) porPartida.get(l.match_id).push(l);

  const nome = new Map(players.map((p) => [p.id, p.nome]));
  const atletas = new Map();
  const goleiros = new Map();
  const novoAtleta = (id) => ({
    id, nome: nome.get(id) || '?', jogos: 0, v: 0, e: 0, d: 0, gols: 0, amarelos: 0, vermelhos: 0, historico: [],
  });

  const partidas = doAno.map((m) => {
    const linhas = porPartida.get(m.id);
    const pl = placar(m, linhas);
    for (const l of linhas) {
      const res = resultadoDoTime(l.time, pl);
      const mapa = l.goleiro ? goleiros : atletas;
      if (!mapa.has(l.player_id)) mapa.set(l.player_id, novoAtleta(l.player_id));
      const s = mapa.get(l.player_id);
      s.jogos += 1;
      if (res === 'V') s.v += 1; else if (res === 'E') s.e += 1; else s.d += 1;
      s.gols += l.gols || 0;
      s.amarelos += l.amarelos || 0;
      s.vermelhos += l.vermelhos || 0;
      if (l.goleiro) s.sofridos = (s.sofridos || 0) + (l.time === 'branco' ? pl.verde : pl.branco);
      s.historico.push({ matchId: m.id, data: m.data, time: l.time, res, gols: l.gols || 0, goleiro: l.goleiro, placar: pl });
    }
    return { ...m, linhas, placar: pl };
  });

  const lista = [...atletas.values()].map((s) => {
    const disputados = s.jogos * 3;
    const ganhos = s.v * 3 + s.e;
    return {
      ...s,
      disputados,
      ganhos,
      aprov: disputados ? ganhos / disputados : 0,
      pctVitoria: s.jogos ? s.v / s.jogos : 0,
      media: s.jogos ? s.gols / s.jogos : 0,
    };
  });

  const minJogos = Math.max(1, Math.ceil(partidas.length * minJogosPct));
  const porAprov = (a, b) => b.aprov - a.aprov || b.ganhos - a.ganhos || b.jogos - a.jogos || a.nome.localeCompare(b.nome);
  const classificados = lista.filter((s) => s.jogos >= minJogos).sort(porAprov);
  const abaixo = lista.filter((s) => s.jogos < minJogos).sort(porAprov);
  classificados.forEach((s, i) => { s.posAprov = i + 1; });

  // mais gols; empate -> melhor média de gols por jogo (quem marcou em menos jogos)
  const artilharia = lista.filter((s) => s.gols > 0)
    .sort((a, b) => b.gols - a.gols || b.media - a.media || a.nome.localeCompare(b.nome));
  artilharia.forEach((s, i) => { s.posArt = i + 1; });

  const cartoes = [...lista, ...[...goleiros.values()]]
    .filter((s) => s.amarelos || s.vermelhos)
    .sort((a, b) => b.vermelhos - a.vermelhos || b.amarelos - a.amarelos || a.nome.localeCompare(b.nome));

  const listaGoleiros = [...goleiros.values()].map((g) => ({ ...g, mediaSofridos: g.jogos ? g.sofridos / g.jogos : 0 }))
    .sort((a, b) => a.mediaSofridos - b.mediaSofridos || b.jogos - a.jogos);

  const presenca = [...lista].sort((a, b) => b.jogos - a.jogos || porAprov(a, b));

  return {
    partidas,
    atletas: lista,
    porId: new Map(lista.map((s) => [s.id, s])),
    goleirosPorId: new Map(listaGoleiros.map((s) => [s.id, s])),
    classificados,
    abaixo,
    minJogos,
    artilharia,
    cartoes,
    goleiros: listaGoleiros,
    presenca,
    totalGols: partidas.reduce((t, p) => t + p.placar.branco + p.placar.verde, 0),
  };
}

// "nota" usada no sorteio equilibrado: aproveitamento puxado para 50% quando o
// atleta tem poucos jogos (não dá pra confiar em 1 jogo com 100%), + bônus de gols
export function nota(s) {
  if (!s || !s.jogos) return 0.5;
  const peso = s.jogos / (s.jogos + 5);
  return peso * s.aprov + (1 - peso) * 0.5 + Math.min(s.media, 1.2) * 0.08;
}

export function sortearTimes(ids, statsPorId) {
  const embaralhado = [...ids].sort(() => Math.random() - 0.5);
  const ordenado = embaralhado.sort((a, b) => nota(statsPorId.get(b)) - nota(statsPorId.get(a)));
  const branco = [], verde = [];
  let sb = 0, sv = 0;
  // pega sempre o melhor que sobrou e entrega para o time mais fraco no momento
  for (const id of ordenado) {
    const n = nota(statsPorId.get(id));
    if ((sb <= sv && branco.length <= verde.length) || verde.length > branco.length) { branco.push(id); sb += n; }
    else { verde.push(id); sv += n; }
  }
  return { branco, verde, forcaBranco: sb, forcaVerde: sv };
}

export const pct = (x) => `${Math.round((x || 0) * 100)}%`;
export const dec = (x) => (x || 0).toFixed(2).replace('.', ',');
export function dataBR(iso, opts) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', opts || { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function ultimoSabado(base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
}
export function proximoSabado(base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return d;
}
