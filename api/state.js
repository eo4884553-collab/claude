const db = require('./_lib/db');
const { requireRole, sendJson } = require('./_lib/auth');
const seedState = require('./_lib/seed-state.json');

// Estado compartilhado do app (medição, custos, contratos, histórico etc.) — uma única
// "linha" para todo o time. GET: qualquer usuário aprovado (viewer/editor/admin) pode ler.
// PUT: só editor/admin pode salvar (viewer tem acesso somente leitura).
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const user = requireRole(req, res, ['viewer', 'editor', 'admin']);
    if (!user) return;
    try {
      const { rows } = await db.query('SELECT data, updated_at, updated_by FROM app_state WHERE id = 1');
      if (rows.length) {
        return sendJson(res, 200, { data: rows[0].data, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by });
      }
      // Primeira vez: semeia com os dados reais do projeto já embutidos no app.
      await db.query(
        'INSERT INTO app_state (id, data, updated_by) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING',
        [seedState, 'sistema']
      );
      return sendJson(res, 200, { data: seedState, updatedAt: null, updatedBy: 'sistema' });
    } catch (err) {
      return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
    }
  }

  if (req.method === 'PUT') {
    const user = requireRole(req, res, ['editor', 'admin']);
    if (!user) return;
    try {
      const data = req.body;
      if (!data || typeof data !== 'object' || !Array.isArray(data.medicaoItems)) {
        return sendJson(res, 400, { error: 'Dados inválidos.' });
      }
      await db.query(
        `INSERT INTO app_state (id, data, updated_by) VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_by = $2, updated_at = now()`,
        [data, user.email]
      );
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { error: 'Erro no servidor: ' + err.message });
    }
  }

  return sendJson(res, 405, { error: 'Método não permitido.' });
};
