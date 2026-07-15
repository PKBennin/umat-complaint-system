require('dotenv').config();
const pool = require('../db');

(async () => {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE appointments');
    await conn.query('TRUNCATE TABLE comments');
    await conn.query('TRUNCATE TABLE action_logs');
    await conn.query('TRUNCATE TABLE complaints');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✓ Successfully cleared all complaint reports, appointments, action logs, and comments.');
  } finally {
    conn.release();
  }
  process.exit(0);
})().catch((err) => {
  console.error('✗ Failed to clear database tables:', err.message);
  process.exit(1);
});
