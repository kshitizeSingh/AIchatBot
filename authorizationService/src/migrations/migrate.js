#!/usr/bin/env node

/**
 * Database Migration Runner
 * Executes SQL migration files in order
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Read migration files
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file.match(/^\d+_/))
      .sort();

    if (files.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    logger.info(`Found ${files.length} migration file(s)`);

    // Execute each migration
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Executing migration: ${file}`);
      await pool.query(sql);
      logger.info(`✓ Migration completed: ${file}`);
    }

    logger.info('✓ All migrations completed successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: error.message, stack: error.stack });
    console.error('Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run migrations
runMigrations();
