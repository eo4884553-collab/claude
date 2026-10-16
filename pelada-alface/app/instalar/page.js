'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Guia de instalação na tela inicial (o app é um site instalável, não vai para
// as lojas). Abre sem login, para poder ser mandado no grupo. Reconhece o
// celular e já abre a aba certa; no Android usa o "instalar" do próprio Chrome.

const LINK = 'https://amigos-do-alface.vercel.app';

function IconeCompartilhar() {
  return (
    <svg className="ic-ios" viewBox="0 0 24 24" aria-label="ícone Compartilhar">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg className="ic-ios" viewBox="0 0 24 24" aria-label="ícone Adicionar">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Passo({ n, titulo, children }) {
  return (
    <li className="passo">
      <span className="passo-n">{n}</span>
      <div>
        <b>{titulo}</b>
        {children && <div className="muted peq" style={{ marginTop: 3 }}>{children}</div>}
      </div>
    </li>
  );
}

function Iphone() {
  return (
    <ol className="passos">
      <Passo n={1} titulo="Abra o link no Safari">
        O navegador da bússola azul. Se o link abriu dentro do WhatsApp ou do Instagram, toque nos três pontinhos ou na
        bússola e escolha <b>Abrir no Safari</b>.
      </Passo>
      <Passo n={2} titulo={<>Toque em Compartilhar <IconeCompartilhar /></>}>
        O quadradinho com a seta para cima, na barra de baixo da tela (no iPad fica em cima, à direita).
      </Passo>
      <Passo n={3} titulo={<>Role a lista e toque em “Adicionar à Tela de Início” <IconeMais /></>}>
        Se não aparecer, role até o fim e toque em <b>Editar Ações…</b> para ativar a opção.
      </Passo>
      <Passo n={4} titulo="Toque em Adicionar (canto superior direito)">
        Pronto: o escudo do Alface aparece na tela do iPhone, junto com os outros apps.
      </Passo>
    </ol>
  );
}

function Android({ prompt, onInstalar }) {
  return (
    <>
      {prompt && (
        <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
          <b>Seu celular permite instalar com um toque:</b>
          <button className="btn bloco" style={{ marginTop: 10, fontSize: 16 }} onClick={onInstalar}>📲 Instalar agora</button>
        </div>
      )}
      <ol className="passos">
        <Passo n={1} titulo="Abra o link no Google Chrome">
          Se o link abriu dentro do WhatsApp, toque nos três pontinhos <b>⋮</b> e escolha <b>Abrir no Chrome</b>.
        </Passo>
        <Passo n={2} titulo="Toque nos três pontinhos ⋮ (canto superior direito)" />
        <Passo n={3} titulo="Toque em “Instalar app” ou “Adicionar à tela inicial”">
          O nome muda conforme o celular. Em alguns aparece primeiro uma faixa embaixo com <b>Instalar</b> — pode tocar nela.
        </Passo>
        <Passo n={4} titulo="Confirme em Instalar">
          O escudo do Alface aparece na tela inicial e na lista de apps. Samsung Internet também funciona: menu
          <b> ☰ → Adicionar página a → Tela inicial</b>.
        </Passo>
      </ol>
    </>
  );
}

export default function Instalar() {
  const [aba, setAba] = useState('iphone');
  const [instalado, setInstalado] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) setAba('android');
    setInstalado(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
    // o layout guarda o evento de instalação do Chrome, que pode chegar antes desta tela
    if (window.__aaInstall) setPrompt(window.__aaInstall);
    const pega = (e) => { e.preventDefault(); window.__aaInstall = e; setPrompt(e); };
    const ok = () => { setInstalado(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', pega);
    window.addEventListener('appinstalled', ok);
    return () => { window.removeEventListener('beforeinstallprompt', pega); window.removeEventListener('appinstalled', ok); };
  }, []);

  async function instalar() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalado(true);
    window.__aaInstall = null;
    setPrompt(null);
  }

  const msgZap = `⚽ App da Pelada Amigos do Alface!\nRanking, artilharia, cartões e partidas.\n\n👉 Instale no celular: ${LINK}/instalar`;

  return (
    <div className="instalar-bg">
      <div className="instalar">
        <div style={{ textAlign: 'center' }}>
          <img src="/icons/icon-192.png" alt="" width="96" height="96" style={{ borderRadius: 24, boxShadow: '0 10px 26px rgba(0,0,0,.25)', background: '#fff' }} />
          <h1>Instale o app no celular</h1>
          <p className="sub">Amigos do Alface fica na tela inicial com o escudo, abre em tela cheia e sem barra do navegador — igual um app da loja. Não ocupa espaço e é grátis.</p>
        </div>

        {instalado ? (
          <div className="ok" style={{ textAlign: 'center', fontSize: 15 }}>
            ✅ O app já está instalado neste celular.
            <div style={{ marginTop: 10 }}><Link className="btn" href="/">Abrir o app</Link></div>
          </div>
        ) : (
          <>
            <div className="abas">
              <button className={aba === 'iphone' ? 'on' : ''} onClick={() => setAba('iphone')}>📱 iPhone</button>
              <button className={aba === 'android' ? 'on' : ''} onClick={() => setAba('android')}>🤖 Android</button>
            </div>
            {aba === 'iphone' ? <Iphone /> : <Android prompt={prompt} onInstalar={instalar} />}
          </>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <b>Depois de instalar</b>
          <ul className="muted peq" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Abra pelo ícone do escudo na tela inicial.</li>
            <li>Crie sua conta (e-mail e senha) e aguarde o administrador aprovar seu acesso.</li>
            <li>As estatísticas atualizam sozinhas a cada rodada lançada.</li>
          </ul>
        </div>

        <div className="linha-acoes" style={{ marginTop: 16, justifyContent: 'center' }}>
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msgZap)}`} target="_blank" rel="noreferrer">📲 Mandar no WhatsApp</a>
          <button className="btn linha" onClick={() => { navigator.clipboard?.writeText(`${LINK}/instalar`); setCopiado(true); }}>
            {copiado ? '✓ Link copiado' : '🔗 Copiar link'}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 18 }}><Link href="/" className="link">← Ir para o app</Link></p>
      </div>
    </div>
  );
}
