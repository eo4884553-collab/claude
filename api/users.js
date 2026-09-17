const db = require('./_lib/db');
const { requireRole, sendJson, ROLES } = require('./_lib/auth');

// Só administradores gerenciam usuários: aprovar cadastros pendentes, definir quem só
// visualiza e quem pode editar, promover outro admin, ou remover um usuário.
module.exports = async (req, res) => {
  const admin = requireRole(req, res, ['admin']);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const { rows } = await db.query(
        'SELECT id, email, name, role, created_at FROM users ORDER BY (role = \'pending\') DESC, created_at DESC'
      );
      return sendJson(res, 200, { users: rows });
    }

    if (req.method === 'POST') {
      const { id, role } = req.body || {};
      if (!id || !role || !ROLES.includes(role)) {
        return sendJson(res, 400, { error: 'Informe id e um papel válido (pending, viewer, editor, admin).' });
      }
      if (Number(id) === Number(admin.uid)) {
        return sendJson(res, 400, { error: 'Você não pode alterar o seu próprio papel por aqui.' });
      }
      const { rows } = await db.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role',
        [role, id]
      );
      if (!rows.length) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
      return sendJson(res, 200, { ok: true, user: rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return sendJson(res, 400, { error: 'Informe o id do usuário a remover.' });
      if (Number(id) === Number(admin.uid)) {
        return sendJson(res, 400, { error: 'Você não pode remover a si mesmo.' });
      }
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
  }
};
