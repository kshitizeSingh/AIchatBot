/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

(async () => {
  try {
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const full = path.join(dir, file);
      const sql = fs.readFileSync(full, 'utf8');
      console.log(`\n>>> Running migration: ${file}`);
      await db.query(sql);
    }
    console.log('\nAll migrations ran successfully');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed', e);
    process.exit(1);
  }
})();
