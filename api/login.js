const db = require('./_lib/db');
const { verifyPassword, signToken, setAuthCookie, sendJson } = require('./_lib/auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }
    const { email, password } = req.body || {};
    if (!email || !password) {
      return sendJson(res, 400, { error: 'Informe e-mail e senha.' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [emailNorm]);
    const user = rows[0];
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
    }
    if (user.role === 'pending') {
      return sendJson(res, 403, {
        error: 'Seu acesso ainda está pendente de aprovação. Peça ao administrador para liberar seu usuário.',
      });
    }
    const token = signToken(user);
    setAuthCookie(res, token);
    return sendJson(res, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
  }
};
