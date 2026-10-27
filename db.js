const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure it in Render Environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render PostgreSQL normally requires TLS for external connections.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error('Unexpected PostgreSQL pool error:', err.message));
module.exports = { pool };
