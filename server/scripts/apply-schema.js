// Applies server/schema.sql to the MySQL instance defined in .env.
// Uses a multi-statement connection (the mysql CLI is not required on the host).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const dbName = process.env.DB_NAME || 'umat_complaints_db';
  let sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  
  // Strip hardcoded CREATE DATABASE / USE statements from the SQL file so we can target defaultdb on cloud providers
  sql = sql.replace(/CREATE DATABASE[\s\S]*?USE\s+\w+;/i, '');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
  });
  try {
    // Only attempt to create database if running locally
    if (process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    }
    await conn.query(`USE \`${dbName}\`;`);
    await conn.query(sql);
    console.log('✓ Schema applied to', dbName);
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('✗ Schema apply failed:', err.message);
  process.exit(1);
});
