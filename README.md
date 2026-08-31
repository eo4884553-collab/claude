# App Liberação Caixa & Empreitada — Casa Newton (Toscana)

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
| **Contas a Pagar (Cliente)** | Dashboard que vai para o cliente: cards-resumo + tabela de parcelas quinzenais (PIX empreiteiro, ADM, cartão, evolução caixa, vencimentos, status). Editável linha a linha. |
| **Lançar Avanços** | Onde você informa o % de avanço físico/financeiro de cada uma das 20 categorias da obra. É o principal ponto de entrada de dados do dia a dia. |
| **Detalhamento FC** | Itens orçado x realizado de cada categoria (equivalente à aba "Detalhamento F.C" da planilha). Cada categoria soma seus itens automaticamente. |
| **Fluxo de Caixa** | Visão mensal de entradas (recurso próprio + liberação PCI) e saídas (parcelas + ajustes manuais), com saldo acumulado. |
| **Liberação PCI** | Cronograma de liberação do financiamento CAIXA em 6 etapas (aquisição do lote + 5 etapas de 20%), com liberação automática proporcional ao % de obra. |
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

5. **Saldo de recurso disponível.** `(recurso próprio planejado + caixa
   liberado acumulado) − (empreiteiro pago + administração paga + cartão
   pago)`, todos calculados sobre as parcelas com status **REALIZADO**.

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
```

Não há dependência de build/bundler — é só abrir `npm start`. O front-end é
JavaScript puro (sem framework) para manter o projeto simples de manter.
