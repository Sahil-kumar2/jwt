const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

/**
 * Sign a new access token.
 *
 * Payload shape:
 *   sub       → userId
 *   sessionId → active session ID
 *   jti       → unique token ID (used for revocation check)
 *
 * @param {{ userId: string, sessionId: string }} params
 * @returns {{ token: string, tokenId: string }}
 */
function signToken({ userId, sessionId }) {
  const tokenId = randomUUID();

  const token = jwt.sign(
    {
      sub: userId,
      sessionId,
      jti: tokenId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  return { token, tokenId };
}

/**
 * Verify and decode a JWT.
 * Throws if the token is invalid or expired.
 *
 * @param {string} token
 * @returns {{ sub: string, sessionId: string, jti: string }}
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
