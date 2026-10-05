/**
 * In-memory repository.
 *
 * All data lives in JavaScript Maps for the lifetime of the process.
 * This layer is the ONLY place that touches the Maps directly.
 * Swapping to MongoDB means rewriting only this file — auth logic stays untouched.
 */

const users = new Map();        // userId  → user object
const sessions = new Map();     // sessionId → session object
const loginAttempts = new Map(); // token → loginAttempt object

// ─── User operations ────────────────────────────────────────────────────────

/**
 * Find a user by their username.
 * @param {string} username
 * @returns {object|null}
 */
function findUserByUsername(username) {
  for (const user of users.values()) {
    if (user.username === username) return user;
  }
  return null;
}

/**
 * Find a user by their ID.
 * @param {string} id
 * @returns {object|null}
 */
function findUserById(id) {
  return users.get(id) ?? null;
}

/**
 * Create and store a new user.
 * @param {{ id: string, username: string, passwordHash: string }} userData
 * @returns {object}
 */
function createUser(userData) {
  users.set(userData.id, { ...userData });
  return users.get(userData.id);
}

// ─── Session operations ──────────────────────────────────────────────────────

/**
 * Find the single active session for a given user.
 * Returns null if the user has no active session.
 * @param {string} userId
 * @returns {object|null}
 */
function findActiveSessionByUserId(userId) {
  for (const session of sessions.values()) {
    if (session.userId === userId && session.active === true) {
      return session;
    }
  }
  return null;
}

/**
 * Find a session by its ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
function findSessionById(sessionId) {
  return sessions.get(sessionId) ?? null;
}

/**
 * Create and store a new session.
 * @param {{ id: string, userId: string, tokenId: string, createdAt: Date }} sessionData
 * @returns {object}
 */
function createSession(sessionData) {
  const session = {
    ...sessionData,
    active: true,
    revokedAt: null,
  };
  sessions.set(session.id, session);
  return sessions.get(session.id);
}

/**
 * Revoke a session by its ID.
 * Sets active=false and records revokedAt.
 * @param {string} sessionId
 * @returns {object|null} The updated session, or null if not found.
 */
function revokeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.active = false;
  session.revokedAt = new Date();
  sessions.set(sessionId, session);
  return sessions.get(sessionId);
}

// ─── Login attempt operations ─────────────────────────────────────────────────

/**
 * Store a short-lived login attempt keyed by its token.
 * @param {{ token: string, userId: string, expiresAt: Date }} attemptData
 * @returns {object}
 */
function createLoginAttempt(attemptData) {
  loginAttempts.set(attemptData.token, { ...attemptData });
  return loginAttempts.get(attemptData.token);
}

/**
 * Retrieve a login attempt by token.
 * @param {string} token
 * @returns {object|null}
 */
function findLoginAttempt(token) {
  return loginAttempts.get(token) ?? null;
}

/**
 * Delete (invalidate) a login attempt by token.
 * @param {string} token
 */
function deleteLoginAttempt(token) {
  loginAttempts.delete(token);
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  findActiveSessionByUserId,
  findSessionById,
  createSession,
  revokeSession,
  createLoginAttempt,
  findLoginAttempt,
  deleteLoginAttempt,
};
