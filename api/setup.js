const db = require('./_lib/db');
const { hashPassword, signToken, setAuthCookie, sendJson } = require('./_lib/auth');

// Configuração inicial: só funciona enquanto não existir nenhum administrador.
// GET  -> diz se a configuração inicial ainda é necessária.
// POST -> cria o primeiro administrador (nome, e-mail, senha) e já faz login.
module.exports = async (req, res) => {
  try {
    const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
    const needsSetup = rows[0].n === 0;

    if (req.method === 'GET') {
      return sendJson(res, 200, { needsSetup });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }

    if (!needsSetup) {
      return sendJson(res, 403, { error: 'A configuração inicial já foi concluída. Use a tela de login.' });
    }

    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return sendJson(res, 400, { error: 'Preencha nome, e-mail e senha.' });
    }
    if (String(password).length < 6) {
      return sendJson(res, 400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const hash = hashPassword(String(password));
    const insert = await db.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role='admin', name=EXCLUDED.name, password_hash=EXCLUDED.password_hash
       RETURNING id, email, name, role`,
      [emailNorm, String(name).trim(), hash]
    );
    const user = insert.rows[0];
    const token = signToken(user);
    setAuthCookie(res, token);
    return sendJson(res, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
  }
};
