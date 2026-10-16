'use client';
import { useMemo, useState } from 'react';
import { useData } from '../../lib/data';
import { nota, pct, sortearTimes } from '../../lib/stats';
import { Busca, normaliza } from '../../components/ui';

// sorteio equilibrado: cada atleta tem uma "nota" baseada no aproveitamento
// (com poucos jogos ela fica perto da média) + gols; os melhores são
// distribuídos alternadamente para o time mais fraco no momento.
export default function Sorteio() {
  const { raw, stats } = useData();
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);

  const todos = useMemo(() => {
    const jogos = (id) => stats.porId.get(id)?.jogos || 0;
    return raw.players.filter((p) => p.ativo && !p.goleiro).sort((a, b) => jogos(b.id) - jogos(a.id) || a.nome.localeCompare(b.nome));
  }, [raw, stats]);
  const lista = q ? todos.filter((p) => normaliza(p.nome).includes(normaliza(q))) : todos;
  const nome = new Map(raw.players.map((p) => [p.id, p.nome]));

  const alterna = (id) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n); setRes(null);
  };

  const Time = ({ ids, cor, forca }) => (
    <div className="card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, textTransform: 'uppercase' }}>
        <span className={`camisa ${cor}`} />Time {cor}
      </h3>
      <p className="muted peq" style={{ margin: '2px 0 8px' }}>{ids.length} atletas · força {Math.round((forca / Math.max(ids.length, 1)) * 100)}</p>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {ids.map((id) => <li key={id} style={{ padding: '3px 0' }}><b>{nome.get(id)}</b> <span className="muted peq">{pct(stats.porId.get(id)?.aprov)}</span></li>)}
      </ol>
    </div>
  );

  return (
    <>
      <div className="pg-tit">
        <h1>Sorteio de times</h1>
        <p>Marque quem chegou e sorteie Branco × Verde equilibrados pelo aproveitamento da temporada. Pode sortear de novo quantas vezes quiser.</p>
      </div>
      {res && (
        <>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <Time ids={res.branco} cor="branco" forca={res.forcaBranco} />
            <Time ids={res.verde} cor="verde" forca={res.forcaVerde} />
          </div>
          <div className="linha-acoes" style={{ margin: '12px 0 20px' }}>
            <button className="btn" onClick={() => setRes(sortearTimes([...sel], stats.porId))}>🎲 Sortear de novo</button>
            <button className="btn linha" onClick={() => {
              const txt = `⚽ Pelada Amigos do Alface\n\n⚪ BRANCO\n${res.branco.map((i) => '- ' + nome.get(i)).join('\n')}\n\n🟢 VERDE\n${res.verde.map((i) => '- ' + nome.get(i)).join('\n')}`;
              navigator.clipboard?.writeText(txt);
              window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
            }}>📲 Enviar no WhatsApp</button>
          </div>
        </>
      )}
      <div className="sec-tit" style={{ marginTop: 6 }}>
        <h2>Presentes: {sel.size}</h2>
        <button className="btn peq" disabled={sel.size < 4} onClick={() => setRes(sortearTimes([...sel], stats.porId))}>🎲 Sortear</button>
      </div>
      <Busca valor={q} onChange={setQ} />
      <div className="card" style={{ padding: '4px 14px' }}>
        {lista.map((p) => {
          const s = stats.porId.get(p.id);
          return (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #eef3ef', cursor: 'pointer' }}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => alterna(p.id)} style={{ width: 20, height: 20, accentColor: 'var(--verde)' }} />
              <b style={{ flex: 1 }}>{p.nome}</b>
              <span className="muted peq">{s ? `${s.jogos}j · ${pct(s.aprov)}` : 'novo'} · nota {Math.round(nota(s) * 100)}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
