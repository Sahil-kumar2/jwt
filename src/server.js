require('dotenv').config();

const app = require('./app');
const { seed } = require('./data/seed');

const PORT = process.env.PORT || 3000;

async function start() {
  // Populate in-memory DB with dev user before accepting requests
  await seed();

  app.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
    console.log(`[server] GET http://localhost:${PORT}/health`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
