// Applies server/schema.sql to the MySQL instance defined in .env.
// Uses a multi-statement connection (the mysql CLI is not required on the host).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('✓ Schema applied to', process.env.DB_NAME || 'umat_complaints_db');
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('✗ Schema apply failed:', err.message);
  process.exit(1);
});
