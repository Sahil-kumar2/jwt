const authService = require('../services/auth.service');

// ─── POST /auth/login ─────────────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);

    if (result.status === 400) {
      return res.status(400).json({ success: false, message: result.message });
    }

    if (result.status === 401) {
      return res.status(401).json({ success: false, message: result.message });
    }

    if (result.status === 409) {
      return res.status(409).json({
        success: false,
        code: 'ACTIVE_SESSION',
        message: 'An active session already exists.',
        requiresAction: true,
        loginAttemptToken: result.loginAttemptToken,
      });
    }

    // 200 — successful first login
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/session/continue ─────────────────────────────────────────────

function continueSession(req, res, next) {
  try {
    const { loginAttemptToken } = req.body;
    const result = authService.continueSession(loginAttemptToken);

    if (result.status === 400) {
      return res.status(400).json({ success: false, message: result.message });
    }

    if (result.status === 401) {
      return res.status(401).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Previous session invalidated. New session created.',
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────

function logout(req, res, next) {
  try {
    // req.auth is guaranteed by the authenticate middleware
    authService.logout(req.auth.sessionId);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

function me(req, res, next) {
  try {
    const user = authService.getMe(req.auth.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or revoked authentication token',
      });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, continueSession, logout, me };
