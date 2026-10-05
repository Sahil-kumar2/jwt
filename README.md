# JWT Auth Backend

A Node.js + Express backend implementing JWT authentication with **single active session** enforcement and **double-login detection**.

---

## What it does

- Standard username/password login that returns a signed JWT
- Detects when a user tries to log in while already having an active session
- Returns a short-lived `loginAttemptToken` on duplicate login, letting the frontend present a **Continue | Logout** choice
- **Continue** revokes the old session and issues a brand new JWT; the old JWT stops working immediately
- **Logout** revokes the current session server-side; the JWT becomes dead on the next request
- All sessions and users are stored in JavaScript `Map`s — no external database required

---

## Architecture

```
src/
├── server.js              Entry point — loads env, seeds data, starts HTTP server
├── app.js                 Express setup — middleware, routes, error handler
│
├── routes/
│   └── auth.routes.js     Route definitions for /auth/*
│
├── controllers/
│   └── auth.controller.js HTTP layer — reads req, calls service, writes res
│
├── services/
│   └── auth.service.js    Business logic — login, continue, logout, getMe
│
├── repositories/
│   └── memory.repository.js  Data layer — all Map operations live here
│
├── middleware/
│   └── auth.middleware.js    JWT verification + session validation
│
├── utils/
│   └── jwt.js             signToken / verifyToken helpers
│
└── data/
    └── seed.js            Creates the dev user on startup
```

The repository layer is the only place that touches the Maps. To swap to MongoDB, rewrite `memory.repository.js` — the service and controller layers need no changes.

---

## In-memory database

Three Maps are created when the process starts:

| Map | Key | Value |
|-----|-----|-------|
| `users` | `userId` | `{ id, username, passwordHash }` |
| `sessions` | `sessionId` | `{ id, userId, tokenId, active, createdAt, revokedAt }` |
| `loginAttempts` | `token` | `{ token, userId, expiresAt }` |

Data lives for the lifetime of the process. Restarting the server clears all sessions (users are re-seeded).

---

## JWT

Each token carries:

```json
{
  "sub": "<userId>",
  "sessionId": "<sessionId>",
  "jti": "<tokenId>"
}
```

The `jti` (token ID) is stored on the session record. The middleware checks that the JWT's `jti` matches the session's `tokenId`. When a session is revoked, the stored `tokenId` is gone with it, so any previously issued JWT for that session is permanently dead.

---

## Session management

- A user may have **at most one active session** at a time.
- `active: true` → session is valid.
- `active: false` + `revokedAt` timestamp → session was revoked (logout or continue).

---

## Double-login detection

1. User logs in → session created, JWT_A issued.
2. Same user logs in again → **409 Conflict** returned with a `loginAttemptToken`.
3. The `loginAttemptToken` is a `randomUUID`, stored in `loginAttempts` with a short TTL (default 5 min).
4. It is **not** a JWT and grants **no access** to protected endpoints.
5. Frontend shows **Continue | Logout**.

### Continue flow

`POST /auth/session/continue` with `{ loginAttemptToken }`:

1. Validate the token exists and has not expired.
2. Revoke the old active session.
3. Create a new session.
4. Sign and return JWT_B.
5. Delete the login attempt (single-use).

JWT_A is now dead. JWT_B is the only valid token.

### Logout flow

`POST /auth/logout` (Bearer JWT):

1. Middleware verifies JWT and session.
2. Session is revoked.
3. Any subsequent request with the same JWT returns 401.

---

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/health` | — | Health check |
| `POST` | `/auth/login` | — | Login |
| `POST` | `/auth/session/continue` | — | Swap old session for new one |
| `POST` | `/auth/logout` | Bearer JWT | Revoke current session |
| `GET`  | `/auth/me` | Bearer JWT | Get current user |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | — | **Required.** Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | `15m` | JWT lifetime (e.g. `15m`, `1h`) |
| `LOGIN_ATTEMPT_EXPIRES_IN` | `5m` | Login attempt token lifetime |

Copy `.env.example` to `.env` and fill in `JWT_SECRET`.

---

## Installation

```bash
npm install
```

---

## Running the server

```bash
npm start
```

Or with file-watching (Node 18+):

```bash
npm run dev
```

---

## curl examples

### Health check

```bash
curl http://localhost:3000/health
```

### First login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sahil","password":"123456"}'
```

Response (`200`):

```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "<JWT>",
  "sessionId": "<SESSION_ID>"
}
```

### Duplicate login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sahil","password":"123456"}'
```

Response (`409`):

```json
{
  "success": false,
  "code": "ACTIVE_SESSION",
  "message": "An active session already exists.",
  "requiresAction": true,
  "loginAttemptToken": "<TOKEN>"
}
```

### Continue (swap session)

```bash
curl -X POST http://localhost:3000/auth/session/continue \
  -H "Content-Type: application/json" \
  -d '{"loginAttemptToken":"<TOKEN>"}'
```

Response (`200`):

```json
{
  "success": true,
  "message": "Previous session invalidated. New session created.",
  "accessToken": "<NEW_JWT>",
  "sessionId": "<NEW_SESSION_ID>"
}
```

### Get current user

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <JWT>"
```

Response (`200`):

```json
{
  "success": true,
  "user": {
    "id": "...",
    "username": "sahil"
  }
}
```

### Logout

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <JWT>"
```

Response (`200`):

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## JWT revocation

JWTs are revoked **server-side** by revoking the session. The auth middleware:

1. Verifies the JWT signature and expiry.
2. Looks up the session in memory by `sessionId`.
3. Checks `session.active === true`.
4. Checks `session.tokenId === jwt.jti`.

If any check fails → `401 UNAUTHORIZED`. There is no token blacklist; revocation works by invalidating the session record that the token points to.

---

## Security notes

- Passwords are hashed with `bcrypt` (salt rounds: 10). Plaintext passwords are never stored or logged.
- `JWT_SECRET` is loaded from `.env` — never hardcoded.
- `crypto.randomUUID()` is used for all IDs (session IDs, token IDs, login attempt tokens).
- `userId` is always taken from the verified JWT/session, never from the request body.
- `passwordHash` is stripped before returning any user object.
