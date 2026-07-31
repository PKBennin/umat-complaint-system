require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

(async () => {
  // Reassign all complaints to ADMIN001 first, then delete other staff
  await pool.query("UPDATE complaints SET assigned_staff_id = 'ADMIN001' WHERE assigned_staff_id != 'ADMIN001'");
  await pool.query("UPDATE complaints SET hod_staff_id = NULL WHERE hod_staff_id != 'ADMIN001'");

  // Now delete all staff except ADMIN001
  await pool.query("DELETE FROM staff WHERE staff_id != 'ADMIN001'");

  // Set ADMIN001 password to ADMIN001
  const hash = await bcrypt.hash('ADMIN001', 10);
  await pool.query("UPDATE staff SET password_hash = ? WHERE staff_id = 'ADMIN001'", [hash]);

  const [rows] = await pool.query('SELECT staff_id, name, type FROM staff');
  console.log('Remaining staff:', rows);
  process.exit(0);
})();
