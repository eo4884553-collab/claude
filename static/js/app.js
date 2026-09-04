(function () {
  const itensBody = document.querySelector("#itens-table tbody");
  const curvaBody = document.querySelector("#curva-table tbody");
  const totalPreview = document.getElementById("total-preview");
  const valorMedicaoInput = document.getElementById("valor_medicao");

  function addItemRow(values = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="f-item" placeholder="01.01" value="${values.item || ""}" /></td>
      <td><input type="text" class="f-descricao" placeholder="Descrição do serviço" value="${values.descricao || ""}" /></td>
      <td><input type="text" class="f-unidade" placeholder="m²" value="${values.unidade || ""}" /></td>
      <td><input type="number" step="0.0001" class="f-qtd-contratada" value="${values.qtd_contratada ?? ""}" /></td>
      <td><input type="number" step="0.0001" class="f-qtd-anterior" value="${values.qtd_anterior ?? 0}" /></td>
      <td><input type="number" step="0.0001" class="f-qtd-atual" value="${values.qtd_atual ?? 0}" /></td>
      <td><input type="number" step="0.01" class="f-preco" value="${values.preco_unitario ?? ""}" /></td>
      <td class="f-valor-cell">R$ 0,00</td>
      <td><button type="button" class="remove-row">×</button></td>
    `;
    itensBody.appendChild(tr);
    tr.querySelector(".remove-row").addEventListener("click", () => {
      tr.remove();
      recalcTotal();
    });
    tr.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalcTotal));
    recalcTotal();
  }

  function addCurvaRow(values = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="c-mes" placeholder="jul-26" value="${values.mes || ""}" /></td>
      <td><input type="number" step="0.01" class="c-previsto" value="${values.previsto_acumulado ?? ""}" /></td>
      <td><input type="number" step="0.01" class="c-executado" value="${values.executado_acumulado ?? ""}" /></td>
      <td><button type="button" class="remove-row">×</button></td>
    `;
    curvaBody.appendChild(tr);
    tr.querySelector(".remove-row").addEventListener("click", () => tr.remove());
  }

  function fmtBRL(v) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function recalcTotal() {
    let total = 0;
    itensBody.querySelectorAll("tr").forEach((tr) => {
      const qtdAtual = parseFloat(tr.querySelector(".f-qtd-atual").value) || 0;
      const preco = parseFloat(tr.querySelector(".f-preco").value) || 0;
      const valor = qtdAtual * preco;
      tr.querySelector(".f-valor-cell").textContent = fmtBRL(valor);
      total += valor;
    });
    totalPreview.textContent = fmtBRL(total);
    if (!valorMedicaoInput.dataset.userEdited) {
      valorMedicaoInput.value = total ? total.toFixed(2) : "";
    }
  }

  valorMedicaoInput.addEventListener("input", () => {
    valorMedicaoInput.dataset.userEdited = "1";
  });

  document.getElementById("add-item").addEventListener("click", () => addItemRow());
  document.getElementById("add-curva").addEventListener("click", () => addCurvaRow());

  document.getElementById("toggle-seguranca").addEventListener("change", (e) => {
    document.getElementById("seguranca-fields").classList.toggle("hidden", !e.target.checked);
  });
  document.getElementById("toggle-curva").addEventListener("change", (e) => {
    document.getElementById("curva-fields").classList.toggle("hidden", !e.target.checked);
    if (e.target.checked && curvaBody.children.length === 0) addCurvaRow();
  });

  addItemRow();

  function collectPayload(form) {
    const f = new FormData(form);
    const itens = [];
    itensBody.querySelectorAll("tr").forEach((tr) => {
      const item = tr.querySelector(".f-item").value.trim();
      const descricao = tr.querySelector(".f-descricao").value.trim();
      if (!item && !descricao) return;
      itens.push({
        item,
        descricao,
        unidade: tr.querySelector(".f-unidade").value.trim(),
        qtd_contratada: parseFloat(tr.querySelector(".f-qtd-contratada").value) || 0,
        qtd_anterior: parseFloat(tr.querySelector(".f-qtd-anterior").value) || 0,
        qtd_atual: parseFloat(tr.querySelector(".f-qtd-atual").value) || 0,
        preco_unitario: parseFloat(tr.querySelector(".f-preco").value) || 0,
      });
    });

    const curva_s = [];
    if (document.getElementById("toggle-curva").checked) {
      curvaBody.querySelectorAll("tr").forEach((tr) => {
        const mes = tr.querySelector(".c-mes").value.trim();
        if (!mes) return;
        curva_s.push({
          mes,
          previsto_acumulado: parseFloat(tr.querySelector(".c-previsto").value) || 0,
          executado_acumulado: parseFloat(tr.querySelector(".c-executado").value) || 0,
        });
      });
    }

    let seguranca = null;
    if (document.getElementById("toggle-seguranca").checked) {
      seguranca = {
        com_afastamento: f.get("seg_com_afastamento") || 0,
        sem_afastamento: f.get("seg_sem_afastamento") || 0,
        tipo_tipico: f.get("seg_tipo_tipico") || 0,
        tipo_trajeto: f.get("seg_tipo_trajeto") || 0,
        tipo_doenca: f.get("seg_tipo_doenca") || 0,
        hht: f.get("seg_hht") || 0,
        taxa_gravidade: f.get("seg_taxa_gravidade") || 0,
      };
    }

    const periodoDocIni = f.get("periodo_doc_inicio");
    const periodoDocFim = f.get("periodo_doc_fim");
    let periodoDocumentacao = "";
    if (periodoDocIni && periodoDocFim) {
      periodoDocumentacao = `${toBR(periodoDocIni)} a ${toBR(periodoDocFim)}`;
    }

    const valorMedicao = f.get("valor_medicao")
      ? parseFloat(f.get("valor_medicao"))
      : itens.reduce((s, it) => s + it.qtd_atual * it.preco_unitario, 0);

    return {
      titulo: "RELATÓRIO TÉCNICO",
      contrato: {
        objeto: f.get("objeto"),
        contratada: f.get("contratada"),
        fiscalizacao: f.get("fiscalizacao"),
        contrato: f.get("contrato"),
        os: f.get("os"),
        valor_contratual: parseFloat(f.get("valor_contratual")) || 0,
        prazo: f.get("prazo"),
        inicio: f.get("inicio"),
        termino: f.get("termino"),
      },
      medicao: {
        numero: f.get("medicao_numero"),
        valor_medicao: valorMedicao,
        periodo_faturamento: f.get("periodo_faturamento"),
        periodo_documentacao: periodoDocumentacao,
      },
      itens,
      curva_s,
      seguranca,
      observacoes: f.get("observacoes"),
      responsavel: {
        nome: f.get("resp_nome"),
        cargo: f.get("resp_cargo"),
        crea: f.get("resp_crea"),
      },
    };
  }

  function toBR(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }

  const form = document.getElementById("report-form");
  const statusMsg = document.getElementById("status-msg");
  const submitBtn = form.querySelector(".btn-primary");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusMsg.textContent = "Gerando relatório...";
    statusMsg.className = "";
    submitBtn.disabled = true;

    const payload = collectPayload(form);
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    const logoFile = form.querySelector('input[name="logo"]').files[0];
    const assinaturaFile = form.querySelector('input[name="assinatura"]').files[0];
    if (logoFile) body.append("logo", logoFile);
    if (assinaturaFile) body.append("assinatura", assinaturaFile);

    try {
      const resp = await fetch("/gerar-relatorio", { method: "POST", body });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.erro || `Erro HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "Relatorio_Tecnico.docx";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      statusMsg.textContent = "Relatório gerado com sucesso!";
      statusMsg.className = "ok";
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.className = "error";
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
