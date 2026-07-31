// Removes Assigned-tab verification data. Usage: node scripts/verify-assigned-tab-cleanup.js
require('dotenv').config();
const pool = require('../db.js');
(async () => {
  const conn = await pool.getConnection();
  try {
    const [c1] = await conn.query("DELETE FROM complaints WHERE subject LIKE 'ASSIGN-TAB-VERIFY%'");
    const [c2] = await conn.query("DELETE FROM staff WHERE staff_id IN ('TESTHOD','TESTFIN','TESTDEAN')");
    const [c3] = await conn.query("DELETE FROM students WHERE index_number = '7788990011'");
    console.log(`removed: complaints=${c1.affectedRows} staff=${c2.affectedRows} students=${c3.affectedRows}`);
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
