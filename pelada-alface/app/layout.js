import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Pelada Amigos do Alface',
  description: 'Artilharia, aproveitamento, cartões e partidas da pelada de sábado dos Amigos do Alface — Vespasiano/MG, desde 1997.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Amigos do Alface' },
  icons: { icon: '/favicon.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#109246',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}"
              // guarda o convite de instalação do Chrome/Android para a tela /instalar usar
              + "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__aaInstall=e});",
          }}
        />
      </body>
    </html>
  );
}
