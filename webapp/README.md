# Piquinzada PMO — versão online (multiusuário)

Este é o mesmo painel financeiro do Piquinzada 2027, agora hospedado na
internet: qualquer pessoa com o link consegue acessar (mesmo sem conta
Claude), com login próprio, aprovação de cadastro e dois níveis de acesso
(**Administrador**, que edita tudo, e **Convidado**, que só visualiza).

Tudo abaixo é gratuito para o tamanho de uso de uma equipe interna. Vai levar
uns 15-20 minutos na primeira vez.

## Passo 1 — Criar o projeto no Supabase (banco de dados + login)

1. Acesse **https://supabase.com**, crie uma conta grátis (dá pra entrar com
   GitHub) e clique em **New project**.
2. Escolha um nome (ex.: `piquinzada-pmo`), uma senha de banco (guarde em
   local seguro, não vai precisar dela no dia a dia) e a região mais perto do
   Brasil disponível (`South America (São Paulo)` se aparecer).
3. Espere o projeto terminar de ser criado (1-2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query**, cole **todo** o
   conteúdo do arquivo [`supabase/schema.sql`](./supabase/schema.sql) deste
   projeto, e clique em **Run**. Isso cria as tabelas, as permissões e as
   regras de aprovação — pode rodar de novo sem medo se precisar.
5. Ainda no Supabase, vá em **Project Settings → API**. Você vai precisar de
   dois valores nessa tela mais adiante:
   - **Project URL**
   - **anon public key** (a chave pública — é seguro usar no navegador)
6. (Opcional, recomendado) Em **Authentication → Providers → Email**, você
   pode desativar a confirmação por e-mail ("Confirm email") se quiser que o
   cadastro funcione mesmo sem o usuário clicar num link de confirmação —
   mas mesmo com a confirmação ativada, o acesso real ao painel só libera
   depois que um administrador aprovar a conta na aba **Usuários** do app.

## Passo 2 — Publicar no Vercel

1. Acesse **https://vercel.com** e entre com a sua conta do GitHub (a mesma
   conta/organização onde este repositório está).
2. Clique em **Add New → Project** e escolha este repositório
   (`eo4884553-collab/claude`).
3. Em **Root Directory**, clique em "Edit" e selecione a pasta **`webapp`**
   (importante — o projeto Next.js fica dentro dela, não na raiz do repo).
4. Em **Environment Variables**, adicione:
   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | o "Project URL" do Passo 1.5 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | o "anon public key" do Passo 1.5 |
5. Clique em **Deploy**. Em 1-2 minutos você recebe um link do tipo
   `https://piquinzada-pmo.vercel.app` — esse já é o app funcionando, pronto
   para compartilhar.

## Passo 3 — Criar o primeiro administrador (você)

Ninguém nasce administrador — o primeiro usuário precisa ser promovido
manualmente, uma única vez:

1. Abra o link do Vercel, clique em **"Não tem conta? Cadastre-se"** e crie
   sua conta com seu e-mail e senha.
2. Você vai cair numa tela de **"Aguardando aprovação"** — é esperado.
3. Volte ao Supabase → **SQL Editor** → **New query**, rode (troque o
   e-mail pelo que você acabou de cadastrar):
   ```sql
   update public.profiles
     set role = 'admin', status = 'approved'
     where email = 'seu-email@exemplo.com';
   ```
4. Volte para a aba do app e recarregue a página — você já entra como
   administrador, com acesso total e à tela **Usuários** (link no topo).

Dali em diante, você **não precisa mais mexer no SQL Editor**: qualquer novo
cadastro aparece pendente na tela **Usuários**, e você aprova (e escolhe se a
pessoa é Administrador ou Convidado) direto pelo app.

## Passo 4 — Convidar o time

1. Envie o link do Vercel (ex.: `https://piquinzada-pmo.vercel.app`) para
   quem precisa acessar.
2. Cada pessoa se cadastra com e-mail e senha próprios.
3. Você aprova cada uma em **Usuários**, escolhendo o papel:
   - **Administrador** — edita todos os dados do projeto.
   - **Convidado** — só visualiza (todos os campos ficam travados).

Todo mundo vê os **mesmos dados**, em tempo real — quando um administrador
salva uma alteração, quem estiver com a tela aberta recebe um aviso pra
recarregar e ver a versão mais nova (evita que uma edição de alguém seja
sobrescrita sem querer).

## Passo 5 — Instalar no celular

Depois de logado no navegador do celular (Chrome no Android, Safari no
iPhone):

- **Android (Chrome)**: toque no menu (⋮) → **"Adicionar à tela inicial"** /
  **"Instalar app"**.
- **iPhone (Safari)**: toque no ícone de compartilhar (□↑) →
  **"Adicionar à Tela de Início"**.

O ícone aparece na tela do celular como um app normal, abre em tela cheia
(sem barra de endereço do navegador), e a tela já vem ajustada para toque —
o menu lateral vira uma gaveta que abre com o ☰ no canto superior.

## Domínio próprio (opcional)

O link `piquinzada-pmo.vercel.app` já funciona 100%. Se quiser um endereço
com a cara do evento (ex.: `pmo.piquinzada.com.br`):

1. Compre o domínio num registrador (Registro.br, GoDaddy etc. — em torno de
   R$ 40-100/ano).
2. No painel do Vercel, vá em **Settings → Domains** do seu projeto, adicione
   o domínio e siga as instruções de DNS que o Vercel mostra (geralmente
   adicionar um registro CNAME ou A no painel do seu registrador).
3. Isso funciona tanto no plano gratuito quanto no pago do Vercel — não é
   preciso pagar hospedagem pra ter domínio próprio.

## Como atualizar o app depois

Qualquer alteração de código enviada (`git push`) para a branch conectada ao
Vercel republica o app automaticamente em 1-2 minutos — não precisa refazer
nenhum passo acima.

## Onde cada coisa mora

- `app/` — as páginas (login/cadastro, o app em si, o painel de usuários).
- `components/` — telas de autenticação, painel de admin, e o carregador do
  app financeiro (`PmoFrame.js`).
- `public/pmo-app-template.html` — o mesmo motor de cálculo e todas as telas
  do painel financeiro (idêntico ao artifact standalone), adaptado para
  salvar na nuvem em vez de só no navegador.
- `supabase/schema.sql` — toda a estrutura do banco (tabelas, permissões,
  aprovação de cadastro).

## Segurança, em resumo

- A chave pública (`anon key`) do Supabase é segura para expor no navegador
  — quem decide o que cada pessoa pode ler/gravar é o banco de dados
  (Row Level Security), não o código do site.
- Um Convidado **não consegue** gravar dados mesmo tentando pelas
  ferramentas de desenvolvedor do navegador — o banco recusa a escrita para
  quem não é Administrador aprovado.
- Aprovar/rejeitar/promover usuários só funciona para quem já é
  Administrador aprovado — reforçado tanto na tela quanto no banco.
