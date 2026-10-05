const { verifyToken } = require('../utils/jwt');
const repo = require('../repositories/memory.repository');

/**
 * Authentication middleware.
 *
 * Validates the Bearer JWT, looks up the session in the in-memory store,
 * and confirms the session is still active and the tokenId matches.
 * Attaches { userId, sessionId, tokenId } to req.auth on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  const { sub: userId, sessionId, jti: tokenId } = payload;

  // Look up the session
  const session = repo.findSessionById(sessionId);

  if (!session) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  // Session must be active
  if (!session.active) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  // Session must belong to this user
  if (session.userId !== userId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  // tokenId in the JWT must match the one stored with the session
  if (session.tokenId !== tokenId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked authentication token',
    });
  }

  // Attach auth context for downstream handlers
  req.auth = { userId, sessionId, tokenId };
  next();
}

module.exports = { authenticate };
