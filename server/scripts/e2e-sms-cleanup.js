// Removes the E2E SMS test data (complaint + student + staff) after the user
// confirms SMS receipt. Usage: node scripts/e2e-sms-cleanup.js
require('dotenv').config();
const pool = require('../db.js');
(async () => {
  const conn = await pool.getConnection();
  try {
    const [c1] = await conn.query("DELETE FROM complaints WHERE subject LIKE 'E2E SMS delivery test%'");
    const [c2] = await conn.query("DELETE FROM staff WHERE staff_id = 'SWEEPADMIN'");
    const [c3] = await conn.query("DELETE FROM students WHERE index_number IN ('7844551122') OR email LIKE 'e2e.%@st.umat.edu.gh'");
    console.log(`removed: complaints=${c1.affectedRows} staff=${c2.affectedRows} students=${c3.affectedRows}`);
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
