const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const repo = require('../repositories/memory.repository');

/**
 * Seeds the in-memory database with a development user.
 * Called once at server startup — safe to call multiple times (idempotent).
 */
async function seed() {
  const existing = repo.findUserByUsername('sahil');
  if (existing) return; // already seeded

  const passwordHash = await bcrypt.hash('123456', 10);

  repo.createUser({
    id: randomUUID(),
    username: 'sahil',
    passwordHash,
  });

  console.log('[seed] Dev user "sahil" created.');
}

module.exports = { seed };
