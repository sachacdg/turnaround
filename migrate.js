const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_initial.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(`INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT(name) DO NOTHING`, ['001_initial.sql']);
  console.log('Database migration check complete.');
  await pool.end();
}
main().catch(async err => {
  console.error('Migration failed:', err.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
