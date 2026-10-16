'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useData } from '../lib/data';
import { dataBR, ultimoSabado } from '../lib/stats';
import { normaliza } from './ui';

let seq = 0;
const nova = (time, nome, extra = {}) => ({ key: ++seq, nome, time, goleiro: false, gols: 0, amarelos: 0, vermelhos: 0, ...extra });

// reduz a foto do celular (às vezes 12MP) para caber no envio e ler mais rápido
async function prepararImagem(file, max = 2000) {
  const bmp = await createImageBitmap(file);
  const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * esc);
  c.height = Math.round(bmp.height * esc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  return { blob, b64, url: URL.createObjectURL(blob) };
}

function Contador({ valor, onChange, rot }) {
  return (
    <span className="cont" title={rot}>
      <button type="button" onClick={() => onChange(Math.max(0, valor - 1))}>−</button>
      <em>{rot}{valor}</em>
      <button type="button" onClick={() => onChange(valor + 1)}>+</button>
    </span>
  );
}

function ColunaTime({ time, linhas, setLinhas, conhecidos, extra, setExtra }) {
  const [txt, setTxt] = useState('');
  const minhas = linhas.filter((l) => l.time === time);
  const muda = (key, campo, v) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: v } : l)));

  function adicionar() {
    const nomes = txt.split(/[,;\n]+/).map((n) => n.trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean);
    if (!nomes.length) return;
    setLinhas((ls) => {
      const ja = new Set(ls.filter((l) => l.time === time).map((l) => normaliza(l.nome)));
      const novos = nomes.filter((n) => !ja.has(normaliza(n))).map((n) => nova(time, conhecidos.get(normaliza(n)) || n, { goleiro: !!conhecidos.goleiro?.has(normaliza(n)) }));
      return [...ls, ...novos];
    });
    setTxt('');
  }

  return (
    <div className="card lanc-time">
      <h3><span className={`camisa ${time}`} />Time {time} <span className="muted peq" style={{ marginLeft: 'auto' }}>{minhas.length} atletas</span></h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input className="inp" list="lista-atletas" value={txt} placeholder="Nome do atleta (ou vários separados por vírgula)"
          onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
        <button type="button" className="btn" onClick={adicionar}>+</button>
      </div>
      {minhas.map((l) => (
        <div key={l.key} className="lanc-lin">
          <div className="nm">
            <button type="button" className="x-rem" onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))} aria-label="remover">✕</button>
            <span>{l.nome}</span>
            {!conhecidos.has(normaliza(l.nome)) && <em className="novo">NOVO</em>}
            <button type="button" className={`gk ${l.goleiro ? 'on' : ''}`} onClick={() => muda(l.key, 'goleiro', !l.goleiro)}>GOL</button>
          </div>
          <div className="contadores">
            <Contador rot="⚽" valor={l.gols} onChange={(v) => muda(l.key, 'gols', v)} />
            <Contador rot="🟨" valor={l.amarelos} onChange={(v) => muda(l.key, 'amarelos', v)} />
            <Contador rot="🟥" valor={l.vermelhos} onChange={(v) => muda(l.key, 'vermelhos', v)} />
          </div>
        </div>
      ))}
      <div className="lanc-lin" style={{ borderBottom: 0 }}>
        <div className="nm muted"><span>Gols sem autor / gol contra a favor</span></div>
        <Contador rot="⚽" valor={extra} onChange={setExtra} />
      </div>
    </div>
  );
}

export default function LancarPartida({ editarId }) {
  const { raw, reload } = useData();
  const router = useRouter();
  const existente = editarId ? raw.matches.find((m) => m.id === editarId) : null;

  const [data, setData] = useState(ultimoSabado());
  const [linhas, setLinhas] = useState([]);
  const [extraB, setExtraB] = useState(0);
  const [extraV, setExtraV] = useState(0);
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState(null); // {blob,b64,url}
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [aviso, setAviso] = useState('');
  const inputFoto = useRef();

  const conhecidos = useMemo(() => {
    const m = new Map(raw.players.map((p) => [normaliza(p.nome), p.nome]));
    m.goleiro = new Set(raw.players.filter((p) => p.goleiro).map((p) => normaliza(p.nome)));
    return m;
  }, [raw.players]);

  useEffect(() => {
    if (!existente) return;
    const nomes = new Map(raw.players.map((p) => [p.id, p.nome]));
    setData(existente.data);
    setExtraB(existente.gols_extra_branco);
    setExtraV(existente.gols_extra_verde);
    setObs(existente.observacoes || '');
    setLinhas(raw.matchPlayers.filter((l) => l.match_id === existente.id)
      .map((l) => nova(l.time, nomes.get(l.player_id), { goleiro: l.goleiro, gols: l.gols, amarelos: l.amarelos, vermelhos: l.vermelhos })));
  }, [existente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const placarB = extraB + linhas.filter((l) => l.time === 'branco').reduce((t, l) => t + l.gols, 0);
  const placarV = extraV + linhas.filter((l) => l.time === 'verde').reduce((t, l) => t + l.gols, 0);
  const dataOcupada = raw.matches.find((m) => m.data === data && m.id !== editarId);

  async function lerFoto(file) {
    if (!file) return;
    setMsg(null); setAviso(''); setLendo(true);
    try {
      const img = await prepararImagem(file);
      setFoto(img);
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/ler-sumula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ imagem: img.b64, tipo: 'image/jpeg' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Falha na leitura');
      const conv = (time) => (p) => nova(time, conhecidos.get(normaliza(p.nome)) || p.nome.toUpperCase(), {
        goleiro: p.goleiro, gols: p.gols, amarelos: p.amarelos, vermelhos: p.vermelhos,
      });
      setLinhas([...j.branco.map(conv('branco')), ...j.verde.map(conv('verde'))]);
      setExtraB(j.gols_sem_autor_branco || 0);
      setExtraV(j.gols_sem_autor_verde || 0);
      if (/^\d{4}-\d{2}-\d{2}$/.test(j.data)) setData(j.data);
      setAviso(j.observacoes || '');
      setMsg({ ok: `Foto lida: ${j.branco.length + j.verde.length} atletas. Confira tudo abaixo antes de salvar.` });
    } catch (e) {
      setMsg({ erro: e.message });
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    setMsg(null);
    if (!linhas.length) { setMsg({ erro: 'Adicione os atletas dos dois times.' }); return; }
    setSalvando(true);
    try {
      let fotoUrl = null;
      if (foto?.blob) {
        const caminho = `${data}-${Date.now()}.jpg`;
        const up = await supabase.storage.from('sumulas').upload(caminho, foto.blob, { contentType: 'image/jpeg' });
        if (!up.error) fotoUrl = supabase.storage.from('sumulas').getPublicUrl(caminho).data.publicUrl;
      }
      const { error } = await supabase.rpc('admin_save_match', {
        p_match_id: editarId || null,
        p_data: data,
        p_extra_branco: extraB,
        p_extra_verde: extraV,
        p_obs: obs.trim() || null,
        p_foto: fotoUrl,
        p_players: linhas.map(({ nome, time, goleiro, gols, amarelos, vermelhos }) => ({ nome, time, goleiro, gols, amarelos, vermelhos })),
      });
      if (error) throw error;
      await reload();
      router.push('/partidas');
    } catch (e) {
      setMsg({ erro: e.message });
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a rodada de ${dataBR(existente.data)}? Isso recalcula todos os rankings.`)) return;
    const { error } = await supabase.from('matches').delete().eq('id', existente.id);
    if (error) { setMsg({ erro: error.message }); return; }
    await reload();
    router.push('/partidas');
  }

  return (
    <>
      <datalist id="lista-atletas">
        {raw.players.map((p) => <option key={p.id} value={p.nome} />)}
      </datalist>

      {!existente && (
        <div className="card foto-drop">
          <b>📷 Lançar por foto da súmula</b>
          <p className="muted peq" style={{ margin: '4px 0 10px' }}>Tire foto do papel/quadro com os times e gols. O app lê e preenche tudo; você só confere e salva.</p>
          <input ref={inputFoto} type="file" accept="image/*" hidden onChange={(e) => lerFoto(e.target.files[0])} />
          <button type="button" className="btn" disabled={lendo} onClick={() => inputFoto.current.click()}>
            {lendo ? 'Lendo a foto… (até 1 min)' : 'Escolher / tirar foto'}
          </button>
          {foto && <div><img src={foto.url} alt="Súmula" /></div>}
        </div>
      )}

      <div className="card">
        <div className="grid2">
          <label className="campo" style={{ margin: 0 }}><span>Data da rodada</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo" style={{ margin: 0 }}><span>Observações</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" />
          </label>
        </div>
        {dataOcupada && <div className="erro">Já existe rodada em {dataBR(data)}. Edite-a pela aba Partidas.</div>}
        {new Date(data + 'T12:00').getDay() !== 6 && <p className="muted peq" style={{ marginBottom: 0 }}>⚠️ Esta data não é sábado.</p>}
      </div>

      {aviso && <div className="achado" style={{ marginTop: 14 }}>🤖 <b>Conferir:</b> {aviso}</div>}

      <div className="placar-vivo" style={{ marginTop: 14 }}>
        <span className="camisa branco" /> {placarB} <span style={{ fontSize: 16, opacity: .7 }}>×</span> {placarV} <span className="camisa verde" />
      </div>

      <div className="lanc-times">
        <ColunaTime time="branco" linhas={linhas} setLinhas={setLinhas} conhecidos={conhecidos} extra={extraB} setExtra={setExtraB} />
        <ColunaTime time="verde" linhas={linhas} setLinhas={setLinhas} conhecidos={conhecidos} extra={extraV} setExtra={setExtraV} />
      </div>
      <p className="muted peq">Atletas marcados <em className="novo">NOVO</em> serão cadastrados ao salvar. Marque <span className="gk on">GOL</span> no goleiro: ele vai para o ranking de goleiros.</p>

      {msg?.erro && <div className="erro">{msg.erro}</div>}
      {msg?.ok && <div className="ok">{msg.ok}</div>}
      <div className="linha-acoes" style={{ marginTop: 14 }}>
        <button className="btn" disabled={salvando || !!dataOcupada} onClick={salvar}>
          {salvando ? 'Salvando…' : existente ? '💾 Salvar alterações' : '💾 Salvar rodada'}
        </button>
        {existente && <button className="btn perigo" onClick={excluir}>Excluir rodada</button>}
      </div>
    </>
  );
}
