'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PROJECTS } from '../lib/projects';
import { approvedReimbursementsTotal } from '../lib/reimbursements';
import { fetchEffectiveRole } from '../lib/roles';
import { fetchSharedCashBalance, setSharedCashSaldoInicial } from '../lib/cash';
import { fetchMesasFeijoada, reservarMesa, atualizarMinhaMesa, cancelarMesa, adminSalvarMesa } from '../lib/mesas';

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
export default function PmoFrame({ auth, project, onChangeProject }) {
  const iframeRef = useRef(null);
  const templateRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingSave = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errMsg, setErrMsg] = useState('');
  const [staleNotice, setStaleNotice] = useState(false);
  const lastLocalWrite = useRef(0);
  // papel EFETIVO no projeto atual — pode ser diferente do papel global (profiles.role)
  // se houver uma excecao em project_roles pra este usuario/projeto (ver lib/roles.js)
  const [role, setRole] = useState(auth.isAdmin ? 'admin' : 'convidado');
  const roleRef = useRef(role);
  roleRef.current = role;

  const buildSrcDoc = useCallback((template, dataObj, roleForFrame) => {
    const safeJson = JSON.stringify(dataObj || {}).replace(/</g, '\\u003c');
    const seedScript = `<\/script><script>window.__PIQUINZADA_ROLE__=${JSON.stringify(roleForFrame)};window.__PIQUINZADA_PROJECT_ID__=${JSON.stringify(project.id)};window.__PIQUINZADA_USER_ID__=${JSON.stringify(auth.user.id)};window.__PIQUINZADA_USER_EMAIL__=${JSON.stringify(auth.user.email || '')};window.__PIQUINZADA_STATE__=${safeJson};<\/script><script>`;
    return template.replace(SEED_MARKER, SEED_MARKER + seedScript);
  }, [project.id, auth.user?.id, auth.user?.email]);

  const mount = useCallback(async () => {
    setStatus('loading'); setErrMsg('');
    try {
      if (!templateRef.current) {
        const res = await fetch('/pmo-app-template.html');
        if (!res.ok) throw new Error('Não consegui carregar o app (pmo-app-template.html).');
        templateRef.current = await res.text();
      }
      const effectiveRole = await fetchEffectiveRole(project.id, auth.user.id, auth.isAdmin);
      setRole(effectiveRole);
      const { data, error } = await supabase.from('project_state').select('data,updated_at').eq('id', project.id).maybeSingle();
      if (error) throw error;
      let seed = (data && data.data && Object.keys(data.data).length) ? data.data : null;
      lastLocalWrite.current = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
      // soma das restituicoes de caixa ja aprovadas entra como custo real do evento — busca
      // sempre fresca (nunca fica gravada no project_state, pra nunca ficar desatualizada)
      try {
        const total = await approvedReimbursementsTotal(project.id);
        seed = Object.assign({}, seed, { restituicoesAprovadas: total });
      } catch (_) { /* se falhar, o app abre normalmente so sem essa soma (fica 0) */ }
      // saldo de caixa REAL, compartilhado entre todos os domínios — busca sempre fresco
      // (nunca fica gravado no project_state), soma dados dos 3 domínios de uma vez
      try {
        const cash = await fetchSharedCashBalance();
        seed = Object.assign({}, seed, {
          saldoCompartilhado: cash.saldo,
          saldoCompartilhadoInicial: cash.saldoInicial,
          saldoCompartilhadoDetalhe: {
            totalRecebidoIngressos: cash.totalRecebidoIngressos,
            totalPagoCustos: cash.totalPagoCustos,
            totalPagoRestituicoes: cash.totalPagoRestituicoes,
          },
        });
      } catch (_) { /* se falhar, o app abre normalmente so sem esse saldo (fica 0) */ }
      // mesas da Feijoada do Bloco vivem na tabela mesa_reservas (não no project_state) —
      // qualquer aprovado pode reservar, não só admin (ver seção 11 do schema.sql)
      if (project.id === 'feijoada-bloco') {
        try {
          const mesasFeijoada = await fetchMesasFeijoada(project.id);
          seed = Object.assign({}, seed, { mesasFeijoada });
        } catch (_) { /* se falhar, a aba Mesas abre com o que tinha salvo antes (pode ficar desatualizada) */ }
      }
      const doc = buildSrcDoc(templateRef.current, seed, effectiveRole);
      if (iframeRef.current) iframeRef.current.srcdoc = doc;
    } catch (e) {
      setStatus('error'); setErrMsg(e.message || String(e));
    }
  }, [buildSrcDoc, project.id, auth.user?.id, auth.isAdmin]);

  // troca de projeto (ou primeira montagem) recarrega os dados certos
  useEffect(() => { mount(); /* eslint-disable-next-line */ }, [project.id]);

  // grava no Supabase com um pequeno debounce (varias mudancas seguidas viram 1 escrita só)
  const flushSave = useCallback(async (stateObj) => {
    // mesasFeijoada não é mais gravado aqui — mora na tabela mesa_reservas (ver fetchMesasFeijoada),
    // que é a fonte de verdade; manter essa chave no project_state só deixaria um resíduo obsoleto
    const { mesasFeijoada, ...toSave } = stateObj || {};
    const { error } = await supabase
      .from('project_state')
      .update({ data: toSave, updated_at: new Date().toISOString(), updated_by: auth.user.id })
      .eq('id', project.id);
    lastLocalWrite.current = Date.now();
    iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:save-ack', ok: !error }, '*');
    // um save pode ter mudado "Pago" em Custos ou "valor recebido" em Vendas — ambos entram no
    // saldo de caixa compartilhado. Sem isso, o cartão "Saldo de caixa real" fica com o número
    // antigo (só buscado 1x no mount) até a página ser recarregada na mão.
    if (!error) {
      try {
        const cash = await fetchSharedCashBalance();
        iframeRef.current?.contentWindow?.postMessage({
          type: 'piquinzada:saldo-compartilhado-result', ok: true,
          saldo: cash.saldo, saldoInicial: cash.saldoInicial,
          detalhe: { totalRecebidoIngressos: cash.totalRecebidoIngressos, totalPagoCustos: cash.totalPagoCustos, totalPagoRestituicoes: cash.totalPagoRestituicoes },
        }, '*');
      } catch (_) { /* se falhar, o saldo so fica desatualizado ate o proximo save ou recarregar */ }
    }
  }, [auth.user?.id, project.id]);

  // busca as mesas de novo e empurra pro iframe — usado depois de qualquer ação de mesa (própria
  // ou de outra pessoa chegando pelo realtime) pra tela atualizar sem precisar recarregar a página
  const refreshMesas = useCallback(async () => {
    try {
      const mesasFeijoada = await fetchMesasFeijoada(project.id);
      iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:mesas-result', ok: true, mesasFeijoada }, '*');
    } catch (_) { /* se falhar, a tela so fica desatualizada ate a proxima acao ou recarregar */ }
  }, [project.id]);

  useEffect(() => {
    function onMessage(ev) {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'piquinzada:ready') { setStatus('ready'); return; }
      if (d.type === 'piquinzada:save') {
        if (roleRef.current !== 'admin') return; // so admin grava — o RLS no banco tambem recusaria, isso e so pra nao gastar uma chamada
        pendingSave.current = d.state;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { flushSave(pendingSave.current); }, 600);
      }
      // o motor dentro do iframe nao tem credenciais do Supabase — pede pro pai subir o
      // comprovante (ou abrir o link assinado de um ja anexado) e devolve o resultado por postMessage
      if (d.type === 'piquinzada:upload-comprovante') {
        if (roleRef.current !== 'admin') return;
        (async () => {
          try {
            const file = d.file;
            const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
            const path = `${project.id}/${d.domain}/${d.itemId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error } = await supabase.storage.from('comprovantes').upload(path, file);
            iframeRef.current?.contentWindow?.postMessage({
              type: 'piquinzada:upload-comprovante-result', domain: d.domain, itemId: d.itemId,
              ok: !error, path: error ? null : path,
            }, '*');
          } catch (_) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:upload-comprovante-result', domain: d.domain, itemId: d.itemId, ok: false }, '*');
          }
        })();
      }
      if (d.type === 'piquinzada:view-comprovante' && d.path) {
        supabase.storage.from('comprovantes').createSignedUrl(d.path, 300).then(({ data, error }) => {
          if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
        });
      }
      // saldo inicial do caixa compartilhado é um número da ORGANIZAÇÃO inteira (não de 1
      // projeto) — só admin global mexe; o RLS no banco também recusaria de qualquer forma
      if (d.type === 'piquinzada:set-saldo-compartilhado') {
        if (!auth.isAdmin) return;
        (async () => {
          try {
            await setSharedCashSaldoInicial(Number(d.valor) || 0, auth.user.id);
            const cash = await fetchSharedCashBalance();
            iframeRef.current?.contentWindow?.postMessage({
              type: 'piquinzada:saldo-compartilhado-result', ok: true,
              saldo: cash.saldo, saldoInicial: cash.saldoInicial,
              detalhe: { totalRecebidoIngressos: cash.totalRecebidoIngressos, totalPagoCustos: cash.totalPagoCustos, totalPagoRestituicoes: cash.totalPagoRestituicoes },
            }, '*');
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:saldo-compartilhado-result', ok: false }, '*');
          }
        })();
      }
      // reserva de mesas (Feijoada do Bloco) — QUALQUER usuário aprovado pode reservar, não só
      // admin (diferente do resto do app); pode reservar mais de uma mesa. O RLS no banco é quem
      // de fato garante isso (ver seção 11 do schema.sql); aqui só repassamos pro Supabase e
      // devolvemos a lista atualizada pro iframe — nunca passa pelo flushSave() admin-only.
      if (d.type === 'piquinzada:mesa-reservar') {
        (async () => {
          try {
            await reservarMesa(project.id, Number(d.numero), auth.user.id, auth.user.email, d.nome, d.telefone);
            await refreshMesas();
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:mesas-result', ok: false, error: e.message || String(e) }, '*');
          }
        })();
      }
      if (d.type === 'piquinzada:mesa-atualizar') {
        (async () => {
          try {
            await atualizarMinhaMesa(project.id, Number(d.numero), d.nome, d.telefone, d.pessoas, d.obs);
            await refreshMesas();
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:mesas-result', ok: false, error: e.message || String(e) }, '*');
          }
        })();
      }
      if (d.type === 'piquinzada:mesa-cancelar') {
        (async () => {
          try {
            await cancelarMesa(project.id, Number(d.numero));
            await refreshMesas();
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:mesas-result', ok: false, error: e.message || String(e) }, '*');
          }
        })();
      }
      if (d.type === 'piquinzada:mesa-admin-save') {
        if (roleRef.current !== 'admin') return; // so admin confirma pagamento/troca status — o RLS tambem recusaria
        (async () => {
          try {
            await adminSalvarMesa(project.id, Number(d.numero), d.nome, d.telefone, d.pessoas, d.obs, d.status, d.dataPagamento, d.valorPago);
            await refreshMesas();
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'piquinzada:mesas-result', ok: false, error: e.message || String(e) }, '*');
          }
        })();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [flushSave, refreshMesas, project.id, auth.isAdmin, auth.user?.id, auth.user?.email]);

  // realtime: se OUTRO usuario salvar enquanto esta tela esta aberta, avisa em vez de sobrescrever
  // silenciosamente o que esta sendo visto/editado agora
  useEffect(() => {
    setStaleNotice(false);
    const channel = supabase.channel(`project_state_changes_${project.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_state', filter: `id=eq.${project.id}` }, (payload) => {
        const updatedAt = payload.new?.updated_at ? new Date(payload.new.updated_at).getTime() : 0;
        // ignora o eco da propria gravacao (janela de 2s)
        if (updatedAt - lastLocalWrite.current > 2000) setStaleNotice(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  // realtime: reservas de mesa são feitas por QUALQUER usuário, então duas pessoas podem estar
  // olhando o mapa ao mesmo tempo — isso atualiza a tela de todo mundo assim que alguém reserva,
  // cancela ou tem o pagamento confirmado, sem precisar de aviso/recarregar (não é "sobrescrever
  // o que você está editando", é só mais uma mesa mudando de cor no mapa)
  useEffect(() => {
    if (project.id !== 'feijoada-bloco') return;
    const channel = supabase.channel(`mesa_reservas_changes_${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_reservas', filter: `project_id=eq.${project.id}` }, () => {
        refreshMesas();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id, refreshMesas]);

  function reload() {
    setStaleNotice(false);
    templateRef.current = null; // forca buscar o template de novo tambem (evita cache de um patch antigo)
    mount();
  }

  return (
    <div style={{ position: 'relative', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={topbar}>
        <strong style={{ fontFamily: "'Fraunces', serif" }}>{project.emoji} {project.label}</strong>
        {PROJECTS.length > 1 && (
          <select
            value={project.id}
            onChange={(e) => onChangeProject(e.target.value)}
            style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
            title="Trocar de projeto"
          >
            {PROJECTS.map((p) => <option key={p.id} value={p.id} style={{ color: '#241220' }}>{p.emoji} {p.label}</option>)}
          </select>
        )}
        <span style={badge(role === 'admin' ? '#5C7A16' : '#6B5566')}>{role === 'admin' ? 'Administrador' : 'Convidado · somente leitura'}</span>
        <span style={{ opacity: .7, marginLeft: 4 }}>{auth.user.email}</span>
        <span style={{ marginLeft: 'auto' }} />
        <a href="/restituicoes" style={{ ...topbarBtn, textDecoration: 'none', display: 'inline-block' }}>💸 Restituição de Caixa</a>
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
        title={project.label}
        style={{ flex: 1, border: 'none', width: '100%', display: status === 'ready' ? 'block' : 'none' }}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
      />
    </div>
  );
}
