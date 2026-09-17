const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'obra_session';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';
const ROLES = ['pending', 'viewer', 'editor', 'admin'];

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setAuthCookie(res, token) {
  const maxAge = 30 * 24 * 60 * 60; // 30 dias
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Retorna o payload do usuário autenticado (do cookie) ou null.
function getUserFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Exige que o request tenha um usuário autenticado; caso contrário responde 401 e retorna null.
function requireAuth(req, res) {
  const user = getUserFromReq(req);
  if (!user) {
    sendJson(res, 401, { error: 'Não autenticado. Faça login novamente.' });
    return null;
  }
  return user;
}

// Exige que o usuário autenticado tenha um dos papéis informados; responde 403 caso não tenha.
function requireRole(req, res, allowedRoles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) {
    sendJson(res, 403, { error: 'Você não tem permissão para esta ação.' });
    return null;
  }
  return user;
}

module.exports = {
  ROLES,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  getUserFromReq,
  sendJson,
  requireAuth,
  requireRole,
};
