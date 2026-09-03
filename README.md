# claude
repositorio para o claude

## Controle de Obra — Medição, BM e Físico-Financeiro

Aplicativo de página única (`index.html`) para gestão de medição, boletins de medição (BM),
faturamento e controle físico-financeiro de obras. Basta abrir `index.html` em um navegador
(não requer servidor nem instalação).

Abas: **Importar** · **Controle Master** (Dashboard Executivo, Lançar BM & Base de Dados, Controle
de Supressão, Total do Projeto) · **Físico-Financeiro** (Dashboard, Análise por Disciplina, Base
de Dados) · **Lançar Custos** · **Contratos** · **Histórico**.

Recursos principais:
- Importação da planilha de **MEDIÇÃO** (formato com colunas de BM em pares
  quantidade/valor, ex.: `MEDIÇÕES_ATUALIZADA.xlsx`) e da planilha de **ORÇAMENTO EXECUTIVO
  DETALHADO** (meta de custo e custo realizado/aplicado, ex.:
  `ORÇAMENTO_EXECUTIVO_DETALHADO.xlsx`). O reconhecimento da estrutura é automático (linha de
  cabeçalho, colunas por BM, hierarquia disciplina/grupo, código do item) e os itens são casados
  entre as duas planilhas pelo código numérico do item — sem jamais apagar itens já lançados:
  apenas atualiza/soma o que é importado, e itens ausentes no arquivo permanecem intactos.
- Exportação em Excel (`.xlsx`) com a mesma estrutura e formatação das planilhas originais
  (cabeçalhos, hierarquia de disciplina/grupo, colunas por BM, larguras de coluna), já com todos
  os lançamentos feitos no app — disponível em **Importar**, **Lançar BM** e **Lançar Custos**.
- Leitura de PDF 100% local via PDF.js; IA (Anthropic) é opcional e só é usada se uma chave de
  API for informada — sem ela (ou sem crédito), a leitura local do PDF continua funcionando.
- Filtros, edição em massa (soma/subtração), largura de coluna ajustável em todas as tabelas.
- Backup/importação em JSON, salvamento automático no navegador (localStorage) e exportação de
  uma cópia HTML autônoma (com os dados atuais embutidos) para publicar/hospedar.
- Aprovação de BM propaga automaticamente para Dashboard Executivo, Total do Projeto,
  Histórico de Desvios, Controle de Supressão, Físico-Financeiro e Base de Dados. A aba
  **Lançar BM & Base de Dados** de Controle Master reúne lançamento por BM e aprovação num
  único lugar (evita ter dois pontos de edição divergentes): filtre por BM para ver só os itens
  medidos naquele boletim e aprove item a item ou em massa. O valor/qtd. aprovado nunca pode
  superar o medido — o app corrige automaticamente se uma reimportação reduzir um valor já
  aprovado. Ao importar uma planilha de MEDIÇÃO em **Importar**, o app pergunta se aquelas
  medições já foram aprovadas pela fiscalização e, se sim, aprova em massa (qtd./valor aprovado
  = medido) os itens medidos no arquivo importado.
- Dashboards profissionais em **Controle Master** e **Físico-Financeiro** (stat tiles com
  tendência, medidores de avanço/consumo do orçamento, Curva S, barras horizontais e
  divergentes, status de faturamento, medido BM com reajuste contratual aplicado — percentual
  editável em Lançar BM) seguindo uma paleta validada contra daltonismo, com tooltip, legenda e
  alternância "ver tabela" em cada gráfico.
- Aba **Contratos**: controle dos contratos de fornecedores/subcontratados — cadastro manual ou
  a partir de um PDF anexado (lido localmente via PDF.js, com geração opcional de diretrizes por
  IA), diretrizes/pontos de atenção editáveis, termos aditivos, lançamento de medições/
  faturamentos por contrato e controle de saldo (valor total, medido, aprovado e saldo
  disponível), com alerta de contratos vencidos/vencendo.
- Barra fixa no topo (sempre visível, em qualquer aba) com Total Contrato, Medido, Aprovado,
  Avanço Físico, Meta de Custo, Custo Realizado, Margem e também **Custo Real** e **Margem
  Real** — custo/margem considerando não só a Meta de Custo (orçamento distribuído nas linhas
  de mão de obra) mas o custo efetivamente medido nos contratos de fornecedores, subindo
  conforme mais medições de fornecedores são lançadas.
- Interface enxuta: as explicações de cada seção ficam ocultas atrás de um ícone **"i"** ao
  lado do título (passe o mouse ou toque para ver), em vez de parágrafos fixos ocupando a tela.

O app já é carregado com os dados reais do contrato 90005/2025 (AIR MINAS AR CONDICIONADO LTDA —
reforma do sistema de climatização e adequação da cobertura da Biblioteca Pública Estadual): 340
itens de medição, 346 itens de custo, 23 BMs e 20 disciplinas, extraídos das planilhas de
MEDIÇÃO e ORÇAMENTO EXECUTIVO DETALHADO fornecidas (medição atualizada com os valores oficiais até
a 5ª medição), além de 6 contratos de fornecedores extraídos dos PDFs assinados (locação de
caçambas, instalação de ar-condicionado, reforma de cobertura com termo aditivo, estrutura
metálica, instalação elétrica com termo aditivo e reboco/chapisco). Basta reimportar versões
atualizadas das planilhas em **Importar** sempre que houver uma nova medição/custo — cada
reimportação é tratada como o valor/quantitativo atualizado daquele item (substitui o que estava
lançado, não soma) — os campos continuam editáveis manualmente a qualquer momento.
