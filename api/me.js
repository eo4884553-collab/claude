const { requireAuth, sendJson } = require('./_lib/auth');

module.exports = async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  return sendJson(res, 200, {
    id: user.uid,
    email: user.email,
    name: user.name,
    role: user.role,
  });
};
