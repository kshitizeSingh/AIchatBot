import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  MAX_CONCURRENT_JOBS: z.string().default('5').transform((v) => parseInt(v, 10)),
  PORT: z.string().default('3003').transform((v) => parseInt(v, 10)),

  // Local test mode (bypass Kafka; enable dev endpoints)
  LOCAL_TEST_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Kafka
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_GROUP_ID: z.string().default('ai-processing-service'),
  KAFKA_TOPIC_UPLOADED: z.string().default('document.uploaded'),
  KAFKA_TOPIC_PROCESSED: z.string().default('document.processed'),
  KAFKA_TOPIC_FAILED: z.string().default('document.failed'),

  // Storage
  STORAGE_TYPE: z.enum(['s3', 'minio', 'local']).default('local'),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PATH: z.string().default('./uploads'),

  // DB
  DATABASE_URL: z.string().min(1),

  // Embeddings (Ollama)
  EMBEDDING_PROVIDER: z.enum(['ollama']).default('ollama'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  EMBEDDING_DIMENSIONS: z.string().default('768').transform((v) => parseInt(v, 10)),
  EMBEDDING_BATCH_SIZE: z.string().default('100').transform((v) => parseInt(v, 10)),
  OLLAMA_MAX_CONCURRENCY: z.string().default('4').transform((v) => parseInt(v, 10)),

  // Chunking
  CHUNK_SIZE: z.string().default('1000').transform((v) => parseInt(v, 10)),
  CHUNK_OVERLAP: z.string().default('200').transform((v) => parseInt(v, 10)),

  // Pinecone
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_ENVIRONMENT: z.string().min(1),
  PINECONE_INDEX_NAME: z.string().min(1),
  PINECONE_INDEX_HOST: z.string().min(1)
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration:', parsed.error.flatten());
  process.exit(1);
}

const cfg = parsed.data;

// Derived config
cfg.KAFKA_BROKERS_LIST = cfg.KAFKA_BROKERS.split(',').map((s) => s.trim());

export const config = cfg;
