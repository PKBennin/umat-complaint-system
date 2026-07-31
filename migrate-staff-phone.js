require('dotenv').config();
const pool = require('./db');

async function migrate() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM staff LIKE 'phone'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE staff ADD COLUMN phone VARCHAR(30) NULL AFTER email");
      console.log('Added phone column to staff table');
    }

    const staffUpdates = [
      { staff_id: 'ADMIN001', email: 'admin@umat.edu.gh', phone: '0302900001' },
      { staff_id: 'PS002', email: 'emensah@umat.edu.gh', phone: '0244123456' },
      { staff_id: 'PS333', email: 'jquaye@umat.edu.gh', phone: '0501234567' },
      { staff_id: 'CS444', email: 'jadu@umat.edu.gh', phone: '0277890123' },
      { staff_id: 'V555', email: 'officer@umat.edu.gh', phone: '0555678901' },
      { staff_id: 'PS102', email: 'asimons@umat.edu.gh', phone: '0208123456' },
      { staff_id: 'PS101', email: 'jdean@umat.edu.gh', phone: '0249876543' }
    ];

    for (const u of staffUpdates) {
      await pool.query('UPDATE staff SET email = ?, phone = ? WHERE staff_id = ?', [u.email, u.phone, u.staff_id]);
    }

    await pool.query("UPDATE staff SET email = CONCAT(LOWER(staff_id), '@umat.edu.gh') WHERE email IS NULL OR email = ''");
    await pool.query("UPDATE staff SET phone = '0500000000' WHERE phone IS NULL OR phone = ''");

    const [allStaff] = await pool.query('SELECT staff_id, name, email, phone, type, portfolio FROM staff');
    console.log('Updated staff table:', allStaff);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
