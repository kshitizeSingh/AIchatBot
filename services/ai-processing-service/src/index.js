import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { startConsumer } from './consumers/kafkaConsumer.js';
import { createServer } from './server.js';

async function main() {
  // Start HTTP server (health/dev endpoints, etc.)
  await createServer();

  // Determine local test mode: skip Kafka consumer when enabled
  const localTestMode =
    ((config?.LOCAL_TEST_MODE ?? process.env.LOCAL_TEST_MODE) || '')
      .toString()
      .trim()
      .toLowerCase() === 'true';

  if (localTestMode) {
    logger.info('LOCAL_TEST_MODE enabled — skipping Kafka consumer startup');
  } else {
    logger.info('Starting Kafka consumer…');
    await startConsumer();
  }
}

// Top-level bootstrap with fatal error handling
main().catch((err) => {
  logger.error('Fatal error during service startup', {
    error: err?.stack || err?.message || String(err),
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.warn('SIGINT received — shutting down');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.warn('SIGTERM received — shutting down');
  process.exit(0);
});