require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    const [rows] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='complaints' AND COLUMN_NAME='last_reminded_at' AND TABLE_SCHEMA=DATABASE()"
    );
    if (rows.length) {
      console.log('Column last_reminded_at already exists. No changes needed.');
    } else {
      await pool.query('ALTER TABLE complaints ADD COLUMN last_reminded_at TIMESTAMP NULL');
      console.log('Column last_reminded_at added successfully.');
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
  process.exit(0);
})();
