const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');

async function main() {
  const migrations = [
    '001_initial.sql',
    '002_techlog.sql'
  ];

  for (const name of migrations) {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', name),
      'utf8'
    );

    await pool.query(sql);
    await pool.query(
      `INSERT INTO schema_migrations(name)
       VALUES($1)
       ON CONFLICT(name) DO NOTHING`,
      [name]
    );

    console.log(`Migration checked: ${name}`);
  }

  await pool.end();
}

main().catch(async err => {
  console.error('Migration failed:', err.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
