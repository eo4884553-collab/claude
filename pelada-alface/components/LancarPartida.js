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

function StatusSalvo({ status, pendente, novo }) {
  let txt;
  if (status.tipo === 'salvando') txt = 'Salvando…';
  else if (status.tipo === 'erro') txt = '⚠️ Não salvou — toque no 💾';
  else if (pendente && status.tipo === 'incompleto') txt = 'Salva quando os 2 times tiverem atletas';
  else if (pendente) txt = 'Alterações pendentes…';
  else if (novo) txt = 'Ainda não salva';
  else txt = `✓ Salvo${status.hora ? ' ' + status.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}`;
  return <span className={`status-salvo ${status.tipo === 'erro' ? 'erro' : ''}`} title={status.texto || ''}>{txt}</span>;
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
  const [matchId, setMatchId] = useState(editarId || null); // vira o id da rodada depois do 1º salvamento
  const [fotoUrl, setFotoUrl] = useState(null);
  const [status, setStatus] = useState({ tipo: 'ok' }); // ok | pendente | salvando | erro | incompleto
  const [msg, setMsg] = useState(null);
  const [aviso, setAviso] = useState('');
  const inputFoto = useRef();
  const salvoRef = useRef(null);   // retrato do formulário na última gravação
  const emAndamento = useRef(null); // promessa da gravação em curso (nunca grava duas ao mesmo tempo)
  const timer = useRef();

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
    salvoRef.current = 'carregando'; // o primeiro retrato depois de carregar vira o "já salvo"
  }, [existente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const placarB = extraB + linhas.filter((l) => l.time === 'branco').reduce((t, l) => t + l.gols, 0);
  const placarV = extraV + linhas.filter((l) => l.time === 'verde').reduce((t, l) => t + l.gols, 0);
  const dataOcupada = raw.matches.find((m) => m.data === data && m.id !== matchId);

  // tudo que precisa ser gravado, num texto só: se mudou desde a última gravação, há algo pendente
  const retrato = JSON.stringify({
    data, extraB, extraV, obs: obs.trim(), fotoUrl,
    linhas: linhas.map(({ nome, time, goleiro, gols, amarelos, vermelhos }) => ({ nome, time, goleiro, gols, amarelos, vermelhos })),
  });
  if (salvoRef.current === 'carregando' && existente) salvoRef.current = retrato;
  const pendente = salvoRef.current !== retrato;
  const atual = useRef();
  atual.current = { retrato, data, extraB, extraV, obs, linhas, foto, fotoUrl, matchId, dataOcupada };

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
      setMsg({ ok: `Foto lida: ${j.branco.length + j.verde.length} atletas. Já foi salva — confira e corrija o que precisar.` });
    } catch (e) {
      setMsg({ erro: e.message });
    } finally {
      setLendo(false);
    }
  }

  // grava o estado atual. auto=true: chamada pelo salvamento automático (fica quieta se o
  // formulário ainda está incompleto); auto=false: ícone 💾 / botão concluir
  async function gravar(auto) {
    if (emAndamento.current) await emAndamento.current.catch(() => {});
    const f = atual.current;
    if (salvoRef.current === f.retrato && f.matchId) return true;
    const temDois = f.linhas.some((l) => l.time === 'branco') && f.linhas.some((l) => l.time === 'verde');
    if (!temDois || f.dataOcupada) {
      if (auto) { setStatus({ tipo: 'incompleto' }); return false; }
      setMsg({ erro: f.dataOcupada ? `Já existe rodada em ${dataBR(f.data)}.` : 'Adicione atletas nos dois times antes de salvar.' });
      return false;
    }
    setStatus({ tipo: 'salvando' });
    const tarefa = (async () => {
      let url = f.fotoUrl;
      if (f.foto?.blob && !url) {
        const caminho = `${f.data}-${Date.now()}.jpg`;
        const up = await supabase.storage.from('sumulas').upload(caminho, f.foto.blob, { contentType: 'image/jpeg' });
        if (!up.error) { url = supabase.storage.from('sumulas').getPublicUrl(caminho).data.publicUrl; setFotoUrl(url); }
      }
      const { data: id, error } = await supabase.rpc('admin_save_match', {
        p_match_id: f.matchId,
        p_data: f.data,
        p_extra_branco: f.extraB,
        p_extra_verde: f.extraV,
        p_obs: f.obs.trim() || null,
        p_foto: url,
        p_players: f.linhas.map(({ nome, time, goleiro, gols, amarelos, vermelhos }) => ({ nome, time, goleiro, gols, amarelos, vermelhos })),
      });
      if (error) throw error;
      setMatchId(id);
      atual.current.matchId = id;
      // a foto acabou de entrar no retrato; grava o retrato já com ela
      salvoRef.current = url === f.fotoUrl ? f.retrato : JSON.stringify({ ...JSON.parse(f.retrato), fotoUrl: url });
      await reload();
    })();
    emAndamento.current = tarefa;
    try {
      await tarefa;
      setStatus({ tipo: 'ok', hora: new Date() });
      setMsg((m) => (m?.erro ? null : m));
      return true;
    } catch (e) {
      setStatus({ tipo: 'erro', texto: e.message });
      if (!auto) setMsg({ erro: e.message });
      return false;
    } finally {
      if (emAndamento.current === tarefa) emAndamento.current = null;
    }
  }

  // salvamento automático: 1,5 s depois da última mudança
  useEffect(() => {
    if (!pendente) return undefined;
    setStatus((st) => (st.tipo === 'salvando' ? st : { tipo: 'pendente' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => gravar(true), 1500);
    return () => clearTimeout(timer.current);
  }, [retrato]); // eslint-disable-line react-hooks/exhaustive-deps

  // avisa antes de fechar a página com algo ainda não gravado
  useEffect(() => {
    const aviso = (e) => { if (salvoRef.current !== atual.current.retrato) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);

  async function salvarAgora() {
    clearTimeout(timer.current);
    setMsg(null);
    if (await gravar(false)) setMsg({ ok: 'Rodada salva.' });
  }

  async function concluir() {
    clearTimeout(timer.current);
    if (await gravar(false)) router.push('/partidas');
  }

  async function excluir() {
    if (!confirm(`Excluir a rodada de ${dataBR(data)}? Isso recalcula todos os rankings.`)) return;
    clearTimeout(timer.current);
    if (emAndamento.current) await emAndamento.current.catch(() => {});
    const { error } = await supabase.from('matches').delete().eq('id', atual.current.matchId);
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
          <p className="muted peq" style={{ margin: '4px 0 10px' }}>Tire foto do papel/quadro com os times e gols. O app lê, preenche e salva sozinho; você só confere.</p>
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
        <StatusSalvo status={status} pendente={pendente} novo={!matchId} />
      </div>

      <div className="lanc-times">
        <ColunaTime time="branco" linhas={linhas} setLinhas={setLinhas} conhecidos={conhecidos} extra={extraB} setExtra={setExtraB} />
        <ColunaTime time="verde" linhas={linhas} setLinhas={setLinhas} conhecidos={conhecidos} extra={extraV} setExtra={setExtraV} />
      </div>
      <p className="muted peq">Tudo é salvo sozinho enquanto você lança (ou toque no 💾 para salvar na hora). Atletas marcados <em className="novo">NOVO</em> são cadastrados ao salvar. Marque <span className="gk on">GOL</span> no goleiro: ele vai para o ranking de goleiros.</p>

      {msg?.erro && <div className="erro">{msg.erro}</div>}
      {msg?.ok && <div className="ok">{msg.ok}</div>}
      <div className="linha-acoes" style={{ marginTop: 14 }}>
        <button className="btn" disabled={status.tipo === 'salvando' || !!dataOcupada} onClick={concluir}>✅ Concluir rodada</button>
        {matchId && <button className="btn perigo" onClick={excluir}>{existente ? 'Excluir rodada' : 'Descartar rodada'}</button>}
      </div>

      <button
        type="button"
        className={`fab-salvar ${pendente ? 'pend' : ''}`}
        onClick={salvarAgora}
        disabled={status.tipo === 'salvando'}
        aria-label="Salvar agora"
        title="Salvar agora"
      >
        {status.tipo === 'salvando' ? '⏳' : '💾'}
      </button>
    </>
  );
}
