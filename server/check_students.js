require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    const [rows] = await pool.query('SELECT index_number, name, email, phone, reference_number, is_profile_complete FROM students');
    console.log('--- REGISTERED STUDENTS ---');
    console.log(rows);
    await pool.end();
  } catch (e) {
    console.error('Failed to query students:', e);
  }
})();
