const db = require('./_lib/db');
const { hashPassword, sendJson } = require('./_lib/auth');

// Qualquer pessoa pode se cadastrar, mas fica com papel "pending" (sem acesso a nada)
// até um administrador aprovar e definir o papel (visualizar ou editar).
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return sendJson(res, 400, { error: 'Preencha nome, e-mail e senha.' });
    }
    if (String(password).length < 6) {
      return sendJson(res, 400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [emailNorm]);
    if (existing.rows.length) {
      return sendJson(res, 409, { error: 'Já existe um cadastro com este e-mail.' });
    }
    const hash = hashPassword(String(password));
    await db.query(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'pending')",
      [emailNorm, String(name).trim(), hash]
    );
    return sendJson(res, 200, {
      ok: true,
      message: 'Cadastro enviado. Aguarde a aprovação do administrador para acessar o sistema.',
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
  }
};
