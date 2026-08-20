# claude
repositorio para o claude

## Controle de Obra — Medição, BM e Físico-Financeiro

Aplicativo de página única (`index.html`) para gestão de medição, boletins de medição (BM),
faturamento e controle físico-financeiro de obras. Basta abrir `index.html` em um navegador
(não requer servidor nem instalação).

Abas: **Importar** · **Controle Master** (Dashboard Executivo, Lançar BM, Controle de
Supressão, Total do Projeto) · **Físico-Financeiro** (Análise por Disciplina, Base de Dados) ·
**Lançar Custos** · **Histórico**.

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
  Histórico de Desvios, Controle de Supressão, Físico-Financeiro e Base de Dados.

O app já é carregado com os dados reais do contrato 90005/2025 (AIR MINAS AR CONDICIONADO LTDA —
reforma do sistema de climatização e adequação da cobertura da Biblioteca Pública Estadual): 340
itens de medição, 346 itens de custo, 23 BMs e 20 disciplinas, extraídos das planilhas de
MEDIÇÃO e ORÇAMENTO EXECUTIVO DETALHADO fornecidas. Basta reimportar versões atualizadas dessas
planilhas em **Importar** sempre que houver uma nova medição/custo — os campos continuam
editáveis manualmente a qualquer momento.
