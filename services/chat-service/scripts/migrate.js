const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../src/config');
const logger = require('../src/utils/logger');

class MigrationRunner {
  constructor() {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 5
    });
  }

  async createMigrationsTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    
    await this.pool.query(createTableQuery);
    logger.info('Migrations table created or already exists');
  }

  async getExecutedMigrations() {
    const result = await this.pool.query('SELECT filename FROM migrations ORDER BY id');
    return result.rows.map(row => row.filename);
  }

  async executeMigration(filename, sql) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the migration SQL
      await client.query(sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [filename]
      );
      
      await client.query('COMMIT');
      logger.info(`Migration ${filename} executed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration ${filename} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations() {
    try {
      await this.createMigrationsTable();
      
      const migrationsDir = path.join(__dirname, '..', 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      const executedMigrations = await this.getExecutedMigrations();
      
      for (const filename of migrationFiles) {
        if (executedMigrations.includes(filename)) {
          logger.info(`Migration ${filename} already executed, skipping`);
          continue;
        }
        
        const filePath = path.join(migrationsDir, filename);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        logger.info(`Executing migration: ${filename}`);
        await this.executeMigration(filename, sql);
      }
      
      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  const runner = new MigrationRunner();
  runner.runMigrations()
    .then(() => {
      console.log('Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = MigrationRunner;