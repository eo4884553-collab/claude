# Pelada Amigos do Alface — app online

App (site instalável no celular) com as estatísticas da pelada de sábado:
**ranking de aproveitamento, artilharia, cartões amarelos/vermelhos, goleiros,
partidas, perfil de cada atleta e sorteio de times equilibrado**.

- **Administrador**: lança as rodadas (manual ou por **foto da súmula**), cadastra atletas e libera outros admins.
- **Convidado**: só visualiza. Pode criar conta (e-mail + senha) ou tocar em
  “Entrar como convidado” sem cadastro.
- Login com **esqueci minha senha** (link por e-mail), **reenviar e-mail de confirmação** e troca de senha.
- Já vem com as **27 rodadas de 2026** da planilha (21/02 a 12/09). Os números conferem 100% com o PDF.

Tecnologia (mesma do Piquinzada): Next.js no **Vercel** + banco/login no **Supabase**. Tudo grátis
no tamanho da pelada. A leitura por foto usa a API da Anthropic (Claude), que cobra por uso
(alguns centavos por foto).

---

## Passo 1 — Banco de dados (Supabase)

Use um **projeto novo**, separado do Piquinzada.

1. Em **https://supabase.com** → **New project** (nome `amigos-do-alface`, região São Paulo).
2. **SQL Editor → New query**: cole todo o [`supabase/schema.sql`](./supabase/schema.sql) → **Run**.
3. **SQL Editor → New query**: cole todo o [`supabase/seed.sql`](./supabase/seed.sql) → **Run**
   (carrega as rodadas da planilha; pode rodar de novo sem duplicar).
4. **Project Settings → API**: anote **Project URL** e **anon public key**.

## Passo 2 — Chave da leitura por foto (opcional, mas recomendado)

1. Em **https://console.anthropic.com** crie uma conta, adicione crédito (US$ 5 dura muito) e
   em **API Keys** crie uma chave (`sk-ant-...`).
2. Sem essa chave o app funciona normal; só o botão “Lançar por foto” avisa que não está configurado.

## Passo 3 — Publicar (Vercel)

1. **https://vercel.com** → **Add New → Project** → repositório `eo4884553-collab/claude`.
2. **Root Directory**: escolha a pasta **`pelada-alface`** (não a `webapp`, que é o Piquinzada).
3. **Environment Variables**:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Passo 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key do Passo 1 |
   | `ANTHROPIC_API_KEY` | chave do Passo 2 |

4. **Deploy** → você recebe o link, ex.: `https://amigos-do-alface.vercel.app`.

## Passo 4 — E-mails de senha funcionando

No Supabase → **Authentication → URL Configuration**:
- **Site URL**: o link do Vercel (ex.: `https://amigos-do-alface.vercel.app`)
- **Redirect URLs**: adicione `https://amigos-do-alface.vercel.app/**`

Sem isso, os links de “esqueci minha senha” e de confirmação apontam para `localhost`.

> O e-mail embutido do Supabase envia poucos e-mails por hora. Se a turma toda for se
> cadastrar no mesmo dia, configure um SMTP próprio em **Authentication → Emails → SMTP**
> (ex.: Gmail com senha de app, ou Resend grátis). Também dá para desligar “Confirm email”
> em **Authentication → Providers → Email** para o cadastro valer na hora.

## Passo 5 — Virar administrador

1. Abra o app → **Criar conta** com seu e-mail.
2. No Supabase → **SQL Editor**, rode uma vez (com o seu e-mail):
   ```sql
   update public.profiles set role = 'admin' where email = 'seu-email@exemplo.com';
   ```
3. Recarregue o app: aparece **Mais → Administração**. Outros admins você libera pela aba **Usuários**.

## Passo 6 — Instalar no celular

Abra o link no celular → menu do navegador → **Adicionar à tela inicial**. Fica com o escudo do
Alface como ícone, igual a um app.

---

## Como lançar uma rodada

**Mais → Administração → Lançar rodada**

- **Por foto**: “Escolher / tirar foto” da súmula (papel, quadro ou print da planilha). O app lê
  times, atletas, gols, cartões e goleiros e preenche tudo. Confira (dúvidas de leitura aparecem
  em amarelo) e toque **Salvar rodada**. A foto fica guardada na rodada (“Ver súmula”).
- **Manual**: digite os nomes em cada time (aceita vários separados por vírgula, com
  autocompletar), use os botões `+`/`−` de ⚽ gols, 🟨 amarelo e 🟥 vermelho, marque **GOL** no
  goleiro. Gol contra/sem autor vai no campo próprio do time beneficiado.
- Nome que ainda não existe aparece como **NOVO** e é cadastrado ao salvar.
- Para corrigir: aba **Partidas** → abra a rodada → **Editar rodada** (ou excluir).

## Regras dos cálculos (iguais à planilha)

| Item | Regra |
|---|---|
| Jogos | cada rodada em que o atleta foi escalado (goleiro conta só no ranking de goleiros) |
| Placar | gols dos atletas + gols sem autor do time |
| Pontos | vitória 3, empate 1; disputados = jogos × 3 |
| Aproveitamento | pontos ganhos ÷ pontos disputados; disputa quem jogou ≥ 40% das rodadas (ajustável em **Ajustes**) |
| Artilharia | mais gols; empate → quem jogou mais |
| Cartões | mais vermelhos, depois mais amarelos |
| Goleiros | menor média de gols sofridos |

Na planilha, 4 atletas aparecem nos **dois times na mesma rodada** (SERGINHO 18/04, AMADEU 25/07,
T AMORIM e XANDE 05/09). Mantive igual à planilha (conta 2 jogos, um por time). Se foi erro de
digitação, corrija em **Partidas → Editar rodada**.

## Recarregar a planilha inteira (se precisar)

```bash
python3 scripts/gerar_seed.py caminho/Amigos_do_Alface_26.xlsx 2026
```
Gera um novo `supabase/seed.sql` (só insere rodadas com datas que ainda não existem).

## Rodar no computador

```bash
cp .env.local.example .env.local   # preencha as chaves
npm install
npm run dev                        # http://localhost:3000
```
