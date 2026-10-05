const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const repo = require('../repositories/memory.repository');
const { signToken, verifyToken } = require('../utils/jwt');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a duration string like "5m", "15m", "1h" into milliseconds.
 * Supports s / m / h suffixes.
 */
function parseDurationMs(str) {
  const match = String(str).match(/^(\d+)(s|m|h)$/);
  if (!match) return 5 * 60 * 1000; // default 5 minutes
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
}

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * Attempt login with username + password.
 *
 * Returns one of:
 *   { status: 200, accessToken, sessionId }           – first / clean login
 *   { status: 409, loginAttemptToken }                – duplicate session
 *   { status: 401, message }                          – bad credentials
 */
async function login(username, password) {
  // 1. Validate input exists
  if (!username || !password) {
    return { status: 400, message: 'Username and password are required.' };
  }

  // 2. Find user
  const user = repo.findUserByUsername(username);
  if (!user) {
    return { status: 401, message: 'Invalid username or password.' };
  }

  // 3. Compare password — never log the plaintext password
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return { status: 401, message: 'Invalid username or password.' };
  }

  // 4. Check for an existing active session
  const existingSession = repo.findActiveSessionByUserId(user.id);

  if (existingSession) {
    // 5. Duplicate login — create a short-lived login attempt token
    const attemptToken = randomUUID();
    const durationMs = parseDurationMs(process.env.LOGIN_ATTEMPT_EXPIRES_IN || '5m');

    repo.createLoginAttempt({
      token: attemptToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + durationMs),
    });

    return {
      status: 409,
      loginAttemptToken: attemptToken,
    };
  }

  // 6. No active session — create one
  const sessionId = randomUUID();
  const { token: accessToken, tokenId } = signToken({ userId: user.id, sessionId });

  repo.createSession({
    id: sessionId,
    userId: user.id,
    tokenId,          // stored so middleware can verify it matches the JWT jti
    createdAt: new Date(),
  });

  return { status: 200, accessToken, sessionId };
}

/**
 * Continue — swap the old session for a new one using a loginAttemptToken.
 *
 * Returns one of:
 *   { status: 200, accessToken, sessionId }
 *   { status: 401, message }
 */
function continueSession(loginAttemptToken) {
  if (!loginAttemptToken) {
    return { status: 400, message: 'loginAttemptToken is required.' };
  }

  // 1. Find the login attempt
  const attempt = repo.findLoginAttempt(loginAttemptToken);
  if (!attempt) {
    return { status: 401, message: 'Invalid or expired login attempt token.' };
  }

  // 2. Check expiry
  if (new Date() > attempt.expiresAt) {
    repo.deleteLoginAttempt(loginAttemptToken);
    return { status: 401, message: 'Login attempt token has expired.' };
  }

  // 3. Find and revoke the old active session
  const oldSession = repo.findActiveSessionByUserId(attempt.userId);
  if (oldSession) {
    repo.revokeSession(oldSession.id);
  }

  // 4. Create a new session
  const newSessionId = randomUUID();
  const { token: accessToken, tokenId } = signToken({
    userId: attempt.userId,
    sessionId: newSessionId,
  });

  repo.createSession({
    id: newSessionId,
    userId: attempt.userId,
    tokenId,
    createdAt: new Date(),
  });

  // 5. Consume the login attempt — single use only
  repo.deleteLoginAttempt(loginAttemptToken);

  return { status: 200, accessToken, sessionId: newSessionId };
}

/**
 * Logout — revoke the authenticated session.
 *
 * @param {string} sessionId  From req.auth (set by middleware — never from body)
 * @returns {{ status: 200 }}
 */
function logout(sessionId) {
  repo.revokeSession(sessionId);
  return { status: 200 };
}

/**
 * Get a safe (no passwordHash) user object for /auth/me.
 *
 * @param {string} userId
 * @returns {{ id, username }|null}
 */
function getMe(userId) {
  const user = repo.findUserById(userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user; // strip sensitive field
  return safeUser;
}

module.exports = { login, continueSession, logout, getMe };
