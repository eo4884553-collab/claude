# Gerador de Relatórios Técnicos de Medição — AIR MINAS / DER-ES

> **Uso rápido sem instalar nada:** existe uma versão 100% client-side deste
> app (formulário + geração do .docx rodando direto no navegador, sem
> servidor) em [`webapp/relatorio-der-es.html`](webapp/relatorio-der-es.html)
> — é o mesmo código publicado como página web para uso imediato.

Aplicativo web que monta automaticamente o **Relatório Técnico de Medição**
da AIR MINAS AR CONDICIONADO LTDA no padrão exigido pelo **DER-ES**, a
partir apenas dos dados da medição informados em um formulário. O
documento final é exportado em **Word (.docx)**, já formatado (cores,
tabelas, cabeçalho/rodapé com a logo da empresa, numeração de página etc.)
seguindo o padrão visual dos relatórios de referência da empresa.

Você só precisa preencher os dados de cada medição — o aplicativo cuida de
montar e formatar o relatório inteiro.

## O que o relatório gerado contém

1. **Capa** — Objeto, Contratada, Contrato, Ordem de Serviço, Valor
   Contratual, datas e prazo, além dos dados da medição (número, valor,
   período de faturamento e de documentação) e a linha de Fiscalização
   (DER-ES).
2. **Itens medidos nesta medição** — tabela com Item, Descrição, Unidade,
   Quantidade Contratada, Quantidade Acumulada Anterior, Quantidade desta
   Medição, Quantidade Acumulada Atual, Preço Unitário e Valor Medido, com
   linha de total.
3. **Curva S (opcional)** — gráfico Previsto x Executado gerado
   automaticamente a partir dos valores acumulados mês a mês informados.
4. **Segurança do Trabalho (opcional)** — indicadores de acidentes, HHT e
   taxa de gravidade.
5. **Observações e Considerações Finais** — texto livre.
6. **Responsável Técnico** — nome, cargo, CREA e (opcionalmente) uma
   imagem de assinatura/carimbo.

Cabeçalho com a logo da AIR MINAS e rodapé com identificação do contrato e
numeração de página são inseridos automaticamente em todas as páginas.

## Como executar

Requer Python 3.10+.

```bash
pip install -r requirements.txt
python app.py
```

Depois acesse **http://localhost:5000** no navegador, preencha o
formulário e clique em **"Gerar Relatório em Word (.docx)"**. O arquivo é
baixado automaticamente com o nome
`Relatorio_Tecnico_Med<numero>_<contrato>.docx`.

## Personalização

- **Logotipo**: por padrão é usada a logo da AIR MINAS
  (`static/img/air_minas_logo.png`). É possível enviar outra imagem pelo
  próprio formulário (campo "Logotipo da empresa"), sem precisar alterar
  o código.
- **Assinatura/carimbo**: campo opcional para anexar uma imagem de
  assinatura digitalizada ou carimbo do responsável técnico; se não for
  enviada, o relatório imprime uma linha para assinatura manual.
- **Cores e estilo das tabelas**: definidos em `report_generator.py`
  (paleta extraída dos relatórios de referência da empresa) — ajuste as
  constantes `DARK_BLUE`, `TEXT_BLUE`, `LIGHT_1`, `LIGHT_2` e
  `BORDER_BLUE` caso a identidade visual mude.

## Estrutura do projeto

```
app.py                 # servidor Flask (rotas /  e /gerar-relatorio)
report_generator.py    # lógica de montagem do .docx (python-docx)
templates/index.html   # formulário de entrada de dados
static/css/style.css   # estilo do formulário
static/js/app.js       # lógica do formulário (linhas dinâmicas, envio, download)
static/img/            # logo padrão da AIR MINAS
app_data/              # pasta de trabalho para uploads temporários (logo/assinatura)
```

## Observações técnicas

- A geração do documento é feita inteiramente em memória com
  [`python-docx`](https://python-docx.readthedocs.io/); nenhum dado da
  medição é salvo em disco pelo servidor.
- O gráfico da Curva S é gerado com `matplotlib` no momento da exportação.
- O servidor embutido do Flask (`python app.py`) é adequado para uso
  local/interno. Para uso em produção/rede, recomenda-se rodar atrás de um
  servidor WSGI (gunicorn, waitress etc.).
