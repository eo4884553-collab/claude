'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const PROJECT_ID = 'main';
const SEED_MARKER = '/* __PIQUINZADA_STATE_SEED__ */';

const topbar = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
  background: '#241220', color: '#fff', fontFamily: "'Public Sans', system-ui, sans-serif",
  fontSize: 12.5, flex: '0 0 auto',
};
const topbarBtn = {
  background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 6,
  padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
};
const badge = (bg) => ({ background: bg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 });
const banner = {
  position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, textAlign: 'center',
  background: '#FBEACC', color: '#7A4E0A', padding: '8px 12px', fontSize: 12.5, fontFamily: "'Public Sans', system-ui, sans-serif",
  cursor: 'pointer', borderBottom: '1px solid #E7C888',
};

// Carrega o app PMO (o mesmo motor/telas do arquivo padrao) dentro de um iframe,
// injetando os dados vindos do Supabase e o papel do usuario (admin edita,
// convidado so ve). A comunicacao com o iframe é via postMessage — o app
// dentro do iframe nao muda de arquitetura, so ganha uma ponte pra nuvem.
export default function PmoFrame({ auth }) {
  const iframeRef = useRef(null);
  const templateRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingSave = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errMsg, setErrMsg] = useState('');
  const [staleNotice, setStaleNotice] = useState(false);
  const lastLocalWrite = useRef(0);

  const role = auth.isAdmin ? 'admin' : 'convidado';

  const buildSrcDoc = useCallback((template, dataObj) => {
    const safeJson = JSON.stringify(dataObj || {}).replace(/</g, '\\u003c');
    const seedScript = `<\/script><script>window.__PIQUINZADA_ROLE__=${JSON.stringify(role)};window.__PIQUINZADA_STATE__=${safeJson};<\/script><script>`;
    return template.replace(SEED_MARKER, SEED_MARKER + seedScript);
  }, [role]);

  const mount = useCallback(async () => {
    setStatus('loading'); setErrMsg('');
    try {
      if (!templateRef.current) {
        const res = await fetch('/pmo-app-template.html');
        if (!res.ok) throw new Error('Não consegui carregar o app (pmo-app-template.html).');
        templateRef.current = await res.text();
      }
      const { data, error } = await supabase.from('project_state').select('data,updated_at').eq('id', PROJECT_ID).maybeSingle();
      if (error) throw error;
      const seed = (data && data.data && Object.keys(data.data).length) ? data.data : null;
      lastLocalWrite.current = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
      const doc = buildSrcDoc(templateRef.current, seed);
      if (iframeRef.current) iframeRef.current.srcdoc = doc;
    } catch (e) {
      setStatus('error'); setErrMsg(e.message || String(e));
    }
  }, [buildSrcDoc]);

  useEffect(() => { mount(); /* eslint-disable-next-line */ }, []);

  // grava no Supabase com um pequeno debounce (varias mudancas seguidas viram 1 escrita só)
  const flushSave = useCallback(async (stateObj) => {
    const { error } = await supabase
      .from('project_state')
      .update({ data: stateObj, updated_at: new Date().toISOString(), updated_by: auth.user.id })
      .eq('id', PROJECT_ID);
    lastLocalWrite.current = Date.now();
    iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:save-ack', ok: !error }, '*');
  }, [auth.user?.id]);

  useEffect(() => {
    function onMessage(ev) {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'piquinzada:ready') { setStatus('ready'); return; }
      if (d.type === 'piquinzada:save') {
        if (role !== 'admin') return; // so admin grava — o RLS no banco tambem recusaria, isso e so pra nao gastar uma chamada
        pendingSave.current = d.state;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { flushSave(pendingSave.current); }, 600);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [flushSave, role]);

  // realtime: se OUTRO usuario salvar enquanto esta tela esta aberta, avisa em vez de sobrescrever
  // silenciosamente o que esta sendo visto/editado agora
  useEffect(() => {
    const channel = supabase.channel('project_state_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_state', filter: `id=eq.${PROJECT_ID}` }, (payload) => {
        const updatedAt = payload.new?.updated_at ? new Date(payload.new.updated_at).getTime() : 0;
        // ignora o eco da propria gravacao (janela de 2s)
        if (updatedAt - lastLocalWrite.current > 2000) setStaleNotice(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function reload() {
    setStaleNotice(false);
    templateRef.current = null; // forca buscar o template de novo tambem (evita cache de um patch antigo)
    mount();
  }

  return (
    <div style={{ position: 'relative', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={topbar}>
        <strong style={{ fontFamily: "'Fraunces', serif" }}>🎭 Piquinzada</strong>
        <span style={badge(role === 'admin' ? '#5C7A16' : '#6B5566')}>{role === 'admin' ? 'Administrador' : 'Convidado · somente leitura'}</span>
        <span style={{ opacity: .7, marginLeft: 4 }}>{auth.user.email}</span>
        <span style={{ marginLeft: 'auto' }} />
        {role === 'admin' && <a href="/admin" style={{ ...topbarBtn, textDecoration: 'none', display: 'inline-block' }}>Usuários</a>}
        <button style={topbarBtn} onClick={reload}>↻ Recarregar</button>
        <button style={topbarBtn} onClick={auth.signOut}>Sair</button>
      </div>
      {staleNotice && (
        <div style={banner} onClick={reload}>
          Alguém salvou uma alteração mais recente — toque aqui para recarregar e ver os dados atuais.
        </div>
      )}
      {status === 'loading' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Public Sans', system-ui, sans-serif", color: '#6B5566' }}>
          Carregando dados…
        </div>
      )}
      {status === 'error' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, fontFamily: "'Public Sans', system-ui, sans-serif", color: '#D6323F', padding: 24, textAlign: 'center' }}>
          <p>Não consegui carregar os dados: {errMsg}</p>
          <button style={{ ...topbarBtn, background: '#E01F7F' }} onClick={mount}>Tentar de novo</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Piquinzada PMO"
        style={{ flex: 1, border: 'none', width: '100%', display: status === 'ready' ? 'block' : 'none' }}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
      />
    </div>
  );
}
