import { createConsumer } from '../config/kafka.js';
import { processDocumentMessage } from '../processors/documentProcessor.js';
import { withContext } from '../utils/logger.js';

export const startConsumer = async () => {
  const consumer = await createConsumer();
  const log = withContext({ component: 'kafka-consumer' });

  await consumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat, pause }) => {
      const value = message.value?.toString('utf-8') || '';
      const ctx = withContext({ topic, partition, offset: message.offset });
      try {
        ctx.info('Received message');
        await processDocumentMessage(value);
        // Kafkajs auto-commit unless configured otherwise; defaults are fine for at-least-once
      } catch (err) {
        ctx.error('Message processing error', { error: err?.message });
        // Let retry mechanism at the processor level handle; consumer keeps going
      } finally {
        await heartbeat();
      }
    }
  });
  log.info('Kafka consumer is running');
};
