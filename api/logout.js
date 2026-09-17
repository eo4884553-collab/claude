const { clearAuthCookie, sendJson } = require('./_lib/auth');

module.exports = async (req, res) => {
  clearAuthCookie(res);
  return sendJson(res, 200, { ok: true });
};
