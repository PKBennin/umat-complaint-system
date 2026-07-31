require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

(async () => {
  // Check which staff exist
  const [existing] = await pool.query('SELECT staff_id FROM staff');
  console.log('Current staff:', existing.map(r => r.staff_id));

  const staffToRestore = [
    { staffId: 'PS002', name: 'Faculty Dean', email: 'emensah@umat.edu.gh', type: 'Dean', facultyKey: 'FCaMS', departmentLabel: "Dean's Office (FCaMS)", portfolio: 'Dean of FCaMS' },
    { staffId: 'PS333', name: 'Head of Department', email: 'jquaye@umat.edu.gh', type: 'HOD', facultyKey: 'FCaMS', departmentLabel: 'Computer Science & Engineering', portfolio: 'Head of Department' },
    { staffId: 'CS444', name: 'Faculty Finance Officer', email: 'jadu@umat.edu.gh', type: 'Finance', facultyKey: 'FCaMS', departmentLabel: 'Finance Office (FCaMS)', portfolio: 'Finance Officer' },
  ];

  for (const s of staffToRestore) {
    const existsAlready = existing.some(r => r.staff_id === s.staffId);
    if (existsAlready) {
      console.log(`  ${s.staffId} already exists, skipping.`);
      continue;
    }
    const hash = await bcrypt.hash(s.staffId, 10);
    await pool.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.staffId, s.name, s.email, hash, s.type, s.facultyKey, s.departmentLabel, s.portfolio]
    );
    console.log(`  Restored ${s.staffId} (${s.name})`);
  }

  // Also reset ADMIN001 password to ADMIN001
  const adminHash = await bcrypt.hash('ADMIN001', 10);
  await pool.query("UPDATE staff SET password_hash = ? WHERE staff_id = 'ADMIN001'", [adminHash]);
  console.log('  Reset ADMIN001 password to ADMIN001');

  const [final] = await pool.query('SELECT staff_id, name, type FROM staff');
  console.log('\nFinal staff roster:', final);
  process.exit(0);
})();
