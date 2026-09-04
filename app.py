"""
Aplicativo web para geração automática de Relatórios Técnicos de Medição
(padrão DER-ES) para a AIR MINAS AR CONDICIONADO LTDA.

Uso:
    pip install -r requirements.txt
    python app.py
    # abrir http://localhost:5000
"""
import io
import json
import os
import re
import unicodedata

from flask import Flask, render_template, request, send_file, jsonify

from report_generator import build_report

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB (logos/assinaturas)


def _slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = re.sub(r"[^\w\s-]", "", value).strip().replace(" ", "_")
    return value or "documento"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/gerar-relatorio", methods=["POST"])
def gerar_relatorio():
    payload = request.form.get("payload")
    if not payload:
        return jsonify({"erro": "Dados do formulário ausentes."}), 400
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return jsonify({"erro": "JSON inválido."}), 400

    logo_file = request.files.get("logo")
    assinatura_file = request.files.get("assinatura")
    logo_bytes = logo_file.read() if logo_file and logo_file.filename else None
    assinatura_bytes = assinatura_file.read() if assinatura_file and assinatura_file.filename else None

    try:
        buffer = build_report(data, logo_bytes=logo_bytes, assinatura_bytes=assinatura_bytes)
    except Exception as exc:  # noqa: BLE001
        app.logger.exception("Falha ao gerar relatório")
        return jsonify({"erro": f"Falha ao gerar o relatório: {exc}"}), 500

    contrato = data.get("contrato", {}).get("contrato", "contrato")
    medicao = data.get("medicao", {}).get("numero", "")
    filename = f"Relatorio_Tecnico_Med{medicao}_{_slugify(contrato)}.docx"

    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
