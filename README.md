# App Liberação Caixa & Empreitada — Casa Newton (Toscana)

**Link para abrir com qualquer pessoa (inclusive o cliente), sem precisar instalar nada:**
https://claude.ai/code/artifact/6af599b7-686a-4583-bbc8-1ad3805ae6b6

Esse link abre a versão "exportada em HTML" do app (arquivo único,
`export/liberacao-caixa-toscana.html`, publicado como Claude Artifact). Por
padrão o link é privado — abra-o e use o menu de compartilhamento da própria
página para liberar o acesso a quem precisar (ex.: "qualquer pessoa com o
link" para o cliente). Só você, como dono/editor do link, pode editar; quem
mais abrir vê a versão mais recente em modo somente leitura. Toda edição sua
salva automaticamente (alguns segundos após parar de digitar) e atualiza o
que todo mundo vê nesse mesmo link — não é preciso reenviar nada.

Este repositório também tem uma versão com backend próprio (Node/Express),
para quem preferir rodar localmente ou hospedar em um servidor — ver
"Como rodar" abaixo. As duas versões implementam exatamente a mesma lógica de
cálculo; a diferença é só onde os dados ficam salvos (arquivo local vs. o
próprio Artifact).

Aplicativo de acompanhamento de obra: você lança o **avanço físico** de cada
categoria da obra e o sistema recalcula automaticamente:

- a **liberação de crédito CAIXA (PCI)** por etapa do financiamento;
- o **valor a pagar ao empreiteiro** (RS Engenharia / mão de obra);
- o **saldo de recurso disponível** (recurso próprio + caixa liberado − gasto);
- o **fluxo de caixa mensal** (entradas x saídas);
- o **dashboard "Contas a Pagar"**, que é a visão enviada ao cliente.

Os dados iniciais foram extraídos da planilha `Planilha_planejamento_casas_executiva_Toscana_v2_2.xlsx`
(abas *Detalhamento F.C*, *Contas a pagar*, *Liberação PCI*, *Cronograma de obra* e *Parâmetros*).

## Como rodar

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Os dados ficam salvos em `data/db.json`
(criado automaticamente na primeira execução, a partir do seed em
`server/seed.js`). Esse arquivo não é versionado (está no `.gitignore`) —
é o "banco de dados" local da instalação.

Para voltar aos números originais da planilha a qualquer momento, use o
botão **"Restaurar dados originais da planilha"** na aba **Parâmetros**
(ou `POST /api/reset`).

## As abas do app

| Aba | Papel |
|---|---|
| **Dashboard Executivo** | Visão gerencial da obra (primeira aba, aberta por padrão): cards com os KPIs mais importantes (contrato total x executado, crédito CAIXA x liberado, recurso próprio planejado, % obra real x previsto, saldo conforme o gasto, margem para itens futuros), duas **curvas S** (planejado x executado) — uma para o valor pago ao empreiteiro (PIX + cartão) e outra para a liberação de caixa (PCI) — com legenda, crosshair/tooltip ao passar o mouse, marca de "hoje" e tabela de apoio com os valores mês a mês. Abaixo, uma lista de categorias: clique numa linha para ver claramente o valor orçado, medido e o **saldo do contrato** daquela categoria específica (o que falta pagar por ela). |
| **Contas a Pagar (Cliente)** | Dashboard que vai para o cliente: cards-resumo (contrato, % avanço empreiteiro pago, saldo empreiteiro, % avanço caixa liberado, saldo caixa, saldo de recurso) + tabela de parcelas quinzenais (PIX empreiteiro, ADM, cartão, evolução caixa, data do custo, vencimentos, status). Cada parcela mostra a etiqueta **Mês/Parcela** (ex.: "Agosto/2026 — 1ª Parcela"), calculada automaticamente a partir do vencimento. Editável linha a linha. |
| **Lançar Avanços** | Onde você informa o % de avanço físico/financeiro de cada uma das 20 categorias da obra. É o principal ponto de entrada de dados do dia a dia. |
| **Cronograma de Obra** | Cronograma físico previsto x realizado (equivalente à aba "Cronograma de obra" da planilha): datas de início/término previstas por categoria (extraídas da planilha original), % previsto (calculado a partir das datas) comparado ao % realizado, status (No prazo / Atrasado / Concluído) e uma linha do tempo (mini-gantt) por categoria. O % de avanço é editável direto aqui — é a mesma aba/campo de *Lançar Avanços*, só que com o cronograma ao lado para decidir quando cobrar do empreiteiro conforme a etapa PCI correspondente. |
| **Detalhamento FC** | Itens orçado x realizado de cada categoria (equivalente à aba "Detalhamento F.C" da planilha). Cada categoria soma seus itens automaticamente — a linha "Mão de obra Fama+ material" se ajusta sozinha para nunca deixar o total da categoria passar do orçado (item 12 abaixo). O botão "Lançar compra parcelada no cartão" lança uma compra em N parcelas de uma vez, já somando o cartão na Contas a Pagar de cada mês correspondente (item 13). |
| **Fluxo de Caixa** | Cards de acompanhamento (% avanço empreiteiro pago, saldo empreiteiro, % avanço caixa liberado, saldo caixa) + tabela mensal já organizada por **Mês/1º e 2º Parcela** (mesma divisão quinzenal de Contas a Pagar, na ordem cronológica correta), com entradas (recurso próprio + liberação PCI) e saídas (parcelas + ajustes manuais), saldo acumulado. Tem o botão **"Lançar avanço do mês"**: informe o novo % de cada categoria que avançou, a data em que o custo foi gerado e para qual mês/parcela ele vai vencer — o app rateia pelo peso já estipulado (valor orçado), desconta o cartão informado e já cria a parcela correspondente em Contas a Pagar. |
| **Liberação PCI** | Cronograma de liberação do financiamento CAIXA em 6 etapas (aquisição do lote + 5 etapas de 20%), com liberação automática proporcional ao % de obra — e, logo abaixo, a mesma liberação vista por categoria (as 20 linhas do Detalhamento FC, com a verba CAIXA de cada uma). |
| **Parâmetros** | Dados da obra e parâmetros financeiros globais (recurso próprio planejado, taxa de administração, contrato total do empreiteiro etc.). |

## Como funciona o cálculo (regra de negócio)

1. **Categoria → % de avanço efetivo.** Cada categoria tem um valor orçado e uma
   lista de itens (Detalhamento FC). O % de avanço "efetivo" da categoria é:
   - o **% manual** lançado na aba *Lançar Avanços*, se houver (mostrado em
     **azul**, mesma convenção de "premissa editável" da planilha original); ou
   - senão, o **% calculado automaticamente** pela soma dos itens realizados
     dividida pelo valor orçado da categoria (mostrado em preto/cinza).

   Use o botão **"usar % dos itens"** para voltar ao modo automático a
   qualquer momento.

2. **Valor medido.** `valorMedido = valorOrçado × %avanço efetivo`, por
   categoria. A soma de todas as categorias dá o **% geral da obra**
   (ponderado pelo valor orçado de cada categoria) e o **total medido**.

3. **Liberação de caixa (PCI).** O financiamento CAIXA é liberado em 6 etapas
   (aquisição do lote + 20%/20%/20%/20%/20% do valor da obra). Cada etapa
   libera proporcionalmente conforme o % geral da obra entra na faixa dela.
   Se o banco liberar um valor diferente do calculado, edite o campo
   **"Liberado manual"** na aba Liberação PCI — o valor manual sempre
   prevalece sobre a fórmula (clique em "auto" para voltar ao cálculo).

4. **Pagamento ao empreiteiro.** O "saldo a pagar" é `total medido − total já
   pago via parcelas realizadas`. Esse valor (mais a taxa de administração de
   10% da RS Engenharia) é sugerido automaticamente ao criar uma **nova
   parcela** na aba Contas a Pagar — mas pode ser editado livremente, porque
   nem sempre o valor real bate com o planejado (execução com recurso
   próprio do empreiteiro, atrasos de medição, cartão etc. — exatamente como
   acontecia na planilha original).

   **Atalho: "Lançar avanço do mês" (aba Fluxo de Caixa).** Em vez de lançar
   o avanço em Lançar Avanços e depois criar a parcela manualmente, esse
   atalho faz os dois passos juntos: você informa o novo % acumulado de cada
   categoria que avançou naquele mês, o app calcula `valor gerado = Σ (Δ% ×
   valor orçado da categoria)` — ou seja, usa o **peso já estipulado** de
   cada categoria (seu valor orçado sobre o total) para ratear o quanto
   aquele avanço vale em R$. Informe também o que já saiu pelo **cartão**
   naquele mês: o app desconta esse valor do que sobra para pagar via PIX
   (`empreiteiro PIX = valor gerado − cartão`) e sugere a administração
   (10% sobre o PIX do empreiteiro). Ao confirmar, ele já cria a parcela em
   Contas a Pagar com esses valores (editáveis depois) e atualiza o
   histórico de avanços — sem precisar repetir a conta na mão.

5. **Saldo de recurso disponível.** `(recurso próprio planejado + caixa
   liberado acumulado) − (empreiteiro pago + administração paga + cartão
   pago + pago direto fora do empreiteiro)`, todos calculados sobre as
   parcelas com status **REALIZADO** (mais o item abaixo).

   **Pago direto — fora do contrato do empreiteiro.** A categoria
   "Serviços Preliminares e Gerais" (topografia, projeto arquitetônico,
   licenciamento, registro do lote, ITBI etc.) é paga pelo proprietário
   direto a terceiros — não passa pelo empreiteiro nem pelas parcelas de
   Contas a Pagar. Sem contar esse valor em algum lugar, o dinheiro já
   gasto ali "sumiria" do saldo disponível. Por isso o realizado dessa
   categoria (a soma dos itens editáveis em Detalhamento FC) entra direto
   no gasto acumulado — visível no card **"Pago direto (fora do
   empreiteiro)"** do Dashboard. Qualquer categoria pode receber essa
   mesma marcação (`pagoDiretoProprietario` no dado da categoria) se
   algum dia outro custo passar a ser pago fora do contrato do
   empreiteiro.

6. **Saldo caixa, saldo empreiteiro e % de avanço (para acompanhar).**
   - **Avanço empreiteiro (% pago)** = total já pago ao empreiteiro ÷
     contrato total. **Saldo empreiteiro** = contrato total − já pago (quanto
     falta pagar do contrato inteiro, não só do que já foi medido).
   - **Avanço caixa (% liberado)** = crédito CAIXA (PCI) já liberado ÷ crédito
     total do PCI. **Saldo caixa** = crédito total − já liberado (quanto o
     banco ainda vai liberar).

   Esses quatro números aparecem nos cards do Dashboard e também no topo da
   aba Fluxo de Caixa, para acompanhar lado a lado o avanço do empreiteiro e
   o avanço da liberação do banco.

7. **Mês/Parcela e a data do custo x a data de vencimento.** Toda parcela
   tem uma etiqueta automática **"Mês/1º ou 2º Parcela"** (dias 1–15 do
   vencimento = 1º Parcela, 16 em diante = 2º Parcela — a mesma convenção da
   planilha original), usada para organizar a aba Fluxo de Caixa exatamente
   como a Contas a Pagar. Ao criar uma parcela (pelo formulário "Nova
   parcela" ou por "Lançar avanço do mês"), há dois campos de data
   propositalmente separados:
   - **Data em que o custo foi gerado** — quando o gasto/avanço realmente
     aconteceu;
   - **Para qual mês/parcela ele vai ocorrer (vencimento planejado)** — o mês
     de cobrança/pagamento, que pode ser diferente (ex.: um gasto de cartão
     em agosto que só fecha e é pago em setembro). É essa segunda data que
     define em qual "Mês/Parcela" a parcela é organizada em todas as abas.

8. **Verba disponível para itens futuros (alerta, não ajuste automático).**
   Todo lançamento futuro ainda não realizado (parcelas com status
   **PLANEJADO**) entra na conta de **"Planejado futuro"** — a soma do custo
   total de tudo que ainda falta lançar. Isso é comparado com a **"Verba
   disponível p/ futuros"** = Saldo Caixa (crédito PCI ainda a liberar) +
   Saldo de recurso disponível (recurso próprio + caixa já liberado − já
   gasto). A diferença é a **"Margem para itens futuros"**: positiva, os
   planejados cabem na verba; negativa, o app mostra um aviso no topo do
   Dashboard e do Fluxo de Caixa dizendo quanto falta. Nenhum valor é
   alterado sozinho — é você quem decide se corta, adia ou espera mais
   liberação de caixa, revisando as parcelas planejadas.

9. **Realizar uma parcela planejada — e a reorganização automática do que
   ainda falta (esse ajuste É automático).** Toda parcela tem um campo
   **Status** (`PLANEJADO` / `REALIZADO`) editável direto na tabela de
   Contas a Pagar — é assim que você "realiza" um planejamento: muda o
   status para `REALIZADO` (ou já cria a parcela como realizada, pelo
   formulário "Nova parcela"). Diferente do item 8 (que é só alerta), aqui
   o app **ajusta sozinho** as parcelas que ainda estão `PLANEJADO`: sempre
   que uma parcela vira `REALIZADO`, ele soma tudo que já foi realizado e
   verifica se o que ainda está planejado, somado a isso, ultrapassa o
   **contrato total do empreiteiro** (o orçado). Se ultrapassar, reduz
   proporcionalmente o valor de empreiteiro (PIX) e administração de cada
   parcela ainda planejada, só o suficiente para caber no que resta do
   contrato — nunca aumenta de volta sozinho, e nunca mexe no valor do
   cartão (que normalmente já é gasto real, comprado antes da medição). Um
   aviso aparece explicando quantas parcelas foram ajustadas e por quê, e
   cada parcela alterada ganha uma nota no campo Observação registrando a
   data do ajuste.

10. **Cronograma físico previsto x realizado.** Cada categoria tem uma janela
    prevista (`início` / `término`, extraídos da aba "Cronograma de obra" da
    planilha original) e um **% previsto** calculado no próprio app: 0% antes
    do início, 100% depois do término, proporcional aos dias corridos no
    meio — uma curva planejada linear padrão. (A coluna "% REAL." da linha
    PREVISTO na planilha original não é usada aqui: ela mistura valores fixos
    com fórmulas inconsistentes — ex. `=3/9`, somas de faixas de semanas
    diferentes por linha — e não alimenta nenhum outro cálculo da planilha, só
    o resumo "% EXECUTADA DE OBRA", que usa a linha REALIZADO. Por isso o app
    calcula o % previsto do zero, de forma limpa e consistente.) Comparando
    **% previsto** com **% avanço efetivo** (o mesmo valor de *Lançar
    Avanços*) o app classifica cada categoria como **Concluído**, **No
    prazo** ou **Atrasado**, e mostra isso também de forma agregada (**%
    Previsto (cronograma)** vs. **% Executado (real)**) e ligado à etapa PCI
    corrente — a mesma lógica de liberação de caixa do item 3, só que
    mostrando em qual etapa PCI o avanço físico atual se encontra.

11. **Curva S (Dashboard Executivo).** Duas curvas comparam planejado x
    executado ao longo do tempo, cada uma normalizada como % de um total (o
    eixo nunca mistura duas escalas diferentes):
    - **Curva S — Empreiteiro.** Planejado = soma do valor orçado de cada
      categoria ponderado pelo seu % previsto (item 10) em ~16 pontos mensais
      entre o início e o término previsto da obra. Executado = soma
      acumulada de (PIX + cartão) das parcelas com status REALIZADO, na data
      real de vencimento — os mesmos valores que compõem
      `totalConsumidoContrato` (item 6), só que abertos mês a mês em vez de
      um único total.
    - **Curva S — Caixa.** Planejado = soma acumulada do valor de cada etapa
      PCI no seu mês programado (`mesProgramado` da aba Liberação PCI).
      Executado = a posição atual (`caixaLiberadaAcumulada`, item 3) marcada
      como um degrau a partir de hoje — o modelo de dados não guarda a data
      exata de cada liberação do banco, então o app mostra só o que
      realmente sabe (a posição de hoje), sem inventar um histórico.

    Ambas têm legenda, um crosshair com tooltip ao passar o mouse (mostra
    planejado e executado, em R$ e %, na data apontada), uma marca vertical
    de "hoje" e uma tabela de apoio (`<details>` recolhível) com o valor
    mês a mês — para nenhum número ficar disponível só visualmente.

12. **"Mão de obra Fama+ material" — a linha nunca deixa a categoria estourar
    o orçado.** Em cada categoria do Detalhamento FC, o último item (a mão de
    obra + material do empreiteiro) funciona como uma "sobra": o app calcula
    quanto resta do orçado da categoria depois de somar os demais itens
    (cartão, etc.) e, se o valor lançado nessa linha for maior que essa
    sobra, ele é reduzido automaticamente até caber — nunca para cima
    sozinho (isso exigiria uma medição real), só para baixo, o suficiente
    para o total da categoria nunca ultrapassar o orçado. Quando isso
    acontece, a célula ganha um aviso "ajustado p/ caber no orçado" com o
    valor original lançado no tooltip. (Não reproduz a fórmula original da
    planilha para essa linha — que cruza referências históricas com a aba
    Fluxo de Caixa não replicáveis 1:1 no modelo de dados do app — mas
    aplica a mesma regra de negócio descrita: o realizado da categoria nunca
    passa do orçado.)

13. **Compra parcelada no cartão (Detalhamento FC).** Uma compra no cartão
    muitas vezes gera faturas em meses seguintes (parcelamento). O botão
    "💳 Lançar compra parcelada no cartão" (dentro de cada categoria) pede
    descrição, valor total, quantidade de parcelas, data da compra e o mês
    da 1ª fatura — e faz tudo de uma vez: cria um item por parcela no
    Detalhamento FC (valor dividido igualmente, a última parcela absorve o
    arredondamento) **e** soma automaticamente cada parcela no campo
    "Cartão" da parcela de Contas a Pagar do mês/quinzena correspondente
    (criando a parcela se ainda não existir) — sem precisar editar o cartão
    manualmente depois em Contas a Pagar ou no Fluxo de Caixa.

14. **Liberação por categoria (verba CAIXA) — aba Liberação PCI.** Além das 6
    etapas macro (aquisição do lote + 5 faixas de 20% de obra), a aba mostra
    as mesmas 20 categorias do Detalhamento FC, só que com a **verba CAIXA**
    de cada uma (o crédito do financiamento destinado àquele serviço) em vez
    da verba do contrato do empreiteiro — são a mesma obra vista por duas
    fontes de dinheiro diferentes, extraídas de colunas distintas da
    planilha original (a verba CAIXA por categoria vem das linhas "CAIXA" da
    aba Fluxo de Caixa; ver comentário em `server/seed.js`). Cada categoria
    libera automaticamente na mesma proporção do seu % de avanço efetivo
    (igual à lógica de `valorMedido`), com campo de liberado manual para
    quando o banco liberar valor diferente do calculado.

15. **Execução financeira (Contas a Pagar).** O card antes chamado "Avanço
    caixa (% liberado)" agora chama **Execução financeira** e mostra o valor
    em R$ (não só o %): crédito CAIXA já liberado + recurso próprio
    planejado — a soma de tudo que já está disponível para pagar a obra,
    crescendo conforme o avanço físico libera mais crédito CAIXA.

16. **Dashboard Executivo — visão consolidada de caixa.** Os KPIs incluem o
    crédito CAIXA total (R$1,5 milhão) e liberado, o recurso próprio
    planejado, a mesma execução financeira do item 15 e um card de **saldo**
    (execução financeira − gasto acumulado) — para acompanhar de uma vez só
    quanto dinheiro está disponível e quanto já foi de fato gasto. O
    lançamento "avanço do mês" (aba Fluxo de Caixa) sempre mexe nas duas
    pontas ao mesmo tempo — a liberação de caixa (via % de obra geral) e o
    pagamento sugerido ao empreiteiro — e ambas continuam totalmente
    editáveis linha a linha.

Todo campo calculado pode ser sobrescrito manualmente (ex.: "Total a
transferir" e "Custo total" de uma parcela, ou o valor liberado de uma etapa
PCI). Quando você sobrescreve, o campo fica marcado em azul e passa a valer
até você limpar o override — a mesma lógica de "premissa editável" que a
planilha original já usava (ver aba Instruções da planilha).

### Sobre os dados iniciais

Ao extrair a planilha, percebemos que a coluna "Realizado" do Detalhamento FC
para várias categorias (05 a 19) só espelhava o valor total do contrato
(fórmula `='Fluxo de Caixa '!AS..`) — ou seja, ainda não havia medição real
lançada ali, embora o número parecesse "quase pronto". Por isso o app foi
semeado com o **avanço físico real da aba Cronograma de obra** (categorias 1,
2, 20 = concluídas; 3, 4 = 50%; demais = 0%), que é a fonte confiável até
que novas medições sejam lançadas. Ajuste livremente em "Lançar Avanços".

## Estrutura do projeto

```
server/
  index.js    → API REST (Express)
  calc.js     → motor de cálculo (puro, recalcula tudo a partir dos dados crus)
  store.js    → persistência em data/db.json
  seed.js     → dados iniciais (extraídos da planilha real)
public/
  index.html, app.js, styles.css → SPA (sem build step, JS puro)
data/
  db.json     → "banco de dados" local (gerado, não versionado)
export/
  liberacao-caixa-toscana.html → versão single-file publicada como Artifact (link acima)
```

Não há dependência de build/bundler — é só abrir `npm start`. O front-end é
JavaScript puro (sem framework) para manter o projeto simples de manter.

## Sobre a versão em HTML (Artifact)

`export/liberacao-caixa-toscana.html` é um app completo em um único arquivo:
mesma interface e mesmo motor de cálculo do app Node, mas sem backend — os
dados ficam embutidos na própria página. Publicado como Claude Artifact, ele
ganha superpotências que um HTML comum não tem:

- **Qualquer pessoa com o link abre e vê os dados mais atuais** — não precisa
  instalar Node, clonar o repositório nem rodar servidor.
- **Edições salvam sozinhas.** Ao editar um campo (avanço, parcela, item do
  Detalhamento FC etc.), a página publica automaticamente uma nova versão de
  si mesma alguns segundos depois — e todo mundo com o link vê essa versão
  atualizada. Não existe "enviar arquivo atualizado por e-mail": é sempre o
  mesmo link.
- **Somente o dono/editores do link podem editar.** Quem mais abrir (o
  cliente, por exemplo) vê tudo — dashboard, abas, valores — mas os campos
  aparecem bloqueados, com um aviso "Modo somente leitura" no topo.

Para atualizar essa versão a partir de uma sessão do Claude Code (caso
mude a lógica de cálculo no `server/calc.js` e queira refletir no Artifact
também): copie as mesmas mudanças para o bloco de script equivalente dentro
de `export/liberacao-caixa-toscana.html` e peça para o Claude republicar o
Artifact nesse mesmo link.
