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
- Importação de `MEDIÇÃO.xlsx` e `CUSTO DO CONTRATO.xlsx` (com mapeamento de colunas), sem
  jamais apagar itens já lançados — apenas atualiza/soma o que é importado.
- Leitura de PDF 100% local via PDF.js; IA (Anthropic) é opcional e só é usada se uma chave de
  API for informada — sem ela (ou sem crédito), a leitura local do PDF continua funcionando.
- Filtros, edição em massa (soma/subtração), largura de coluna ajustável em todas as tabelas.
- Backup/importação em JSON, salvamento automático no navegador (localStorage) e exportação de
  uma cópia HTML autônoma (com os dados atuais embutidos) para publicar/hospedar.
- Aprovação de BM propaga automaticamente para Dashboard Executivo, Total do Projeto,
  Histórico de Desvios, Controle de Supressão, Físico-Financeiro e Base de Dados.

O app é carregado inicialmente com dados de demonstração (334 itens de medição/custo, 23 BMs,
18 disciplinas) reconciliados com os totais consolidados de referência. Basta importar as
planilhas reais em **Importar** para substituir os dados de exemplo, mantendo tudo editável.
