import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

const redact = (obj) => {
  if (!obj) return obj;
  const clone = { ...obj };
  const secretKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'PINECONE_API_KEY'];
  for (const k of secretKeys) if (clone[k]) clone[k] = '***';
  return clone;
};

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({ ts: timestamp, level, message, ...meta });
});

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: combine(timestamp(), logFormat),
  transports: [new winston.transports.Console()]
});

export const withContext = (ctx = {}) => {
  return {
    info: (msg, meta = {}) => logger.info(msg, { ...ctx, ...redact(meta) }),
    warn: (msg, meta = {}) => logger.warn(msg, { ...ctx, ...redact(meta) }),
    error: (msg, meta = {}) => logger.error(msg, { ...ctx, ...redact(meta) }),
    debug: (msg, meta = {}) => logger.debug(msg, { ...ctx, ...redact(meta) })
  };
};
