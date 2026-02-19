import { Kafka, logLevel } from 'kafkajs';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

let kafka;
let producer;

export const getKafka = () => {
  if (!kafka) {
    kafka = new Kafka({
      clientId: 'ai-processing-service',
      brokers: config.KAFKA_BROKERS_LIST,
      logLevel: logLevel.NOTHING
    });
  }
  return kafka;
};

export const getProducer = async () => {
  if (config.LOCAL_TEST_MODE) {
    // No-op producer for local testing without Kafka
    return {
      // mimic kafkajs producer interface used by code
      send: async () => {},
      connect: async () => {},
      disconnect: async () => {}
    };
  }
  if (!producer) {
    producer = getKafka().producer();
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
};

export const createConsumer = async () => {
  const consumer = getKafka().consumer({ groupId: config.KAFKA_GROUP_ID });
  await consumer.connect();
  await consumer.subscribe({ topic: config.KAFKA_TOPIC_UPLOADED, fromBeginning: false });
  logger.info('Kafka consumer connected and subscribed', { topic: config.KAFKA_TOPIC_UPLOADED });
  return consumer;
};
