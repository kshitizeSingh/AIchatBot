const { Kafka } = require('kafkajs');
const logger = require('../utils/logger');

const queueType = process.env.QUEUE_TYPE || 'kafka';
let kafka, producer, consumer;

if (queueType === 'kafka') {
  kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'content-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });
  producer = kafka.producer();
  consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'content-service-group' });
  logger.info('Kafka client initialized');
}

module.exports = { queueType, kafka, producer, consumer };
