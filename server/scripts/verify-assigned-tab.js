// Seeds data for Assigned-tab UI verification.
// Usage: node scripts/verify-assigned-tab.js
// Cleanup: node scripts/verify-assigned-tab-cleanup.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db.js');

const BASE = (process.env.API_BASE || 'https://umat-complaint-system.onrender.com').replace(/\/+$/, '');
const PASSWORD = 'AssignedPass#1';
const STUDENT_INDEX = '7788990011';
const HOD_ID = 'TESTHOD';
const FIN_ID = 'TESTFIN';
const DEAN_ID = 'TESTDEAN';

(async () => {
  const conn = await pool.getConnection();
  try {
    const [[fac]] = await conn.query(
      `SELECT f.faculty_key FROM faculties f
        LEFT JOIN staff s ON s.faculty_key = f.faculty_key AND s.type = 'HOD'
       GROUP BY f.faculty_key HAVING COUNT(s.staff_id) = 0 LIMIT 1`,
    );
    const facultyKey = fac ? fac.faculty_key : 'FCMS';
    const [[prog]] = await conn.query(
      'SELECT id, name FROM programmes WHERE faculty_key = ? ORDER BY id LIMIT 1',
      [facultyKey],
    );
    if (!prog) throw new Error(`No programme for faculty ${facultyKey}`);
    console.log(`Faculty: ${facultyKey} | Programme: ${prog.name}`);

    const hash = await bcrypt.hash(PASSWORD, 10);
    await conn.query(
      `INSERT INTO students (index_number, name, email, phone, password_hash, level, is_profile_complete)
       VALUES (?, 'Assigned Tab Student', 'assigned.tab.7788990011@student.umat.edu.gh', 'N/A', ?, 'Level 100', 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
      [STUDENT_INDEX, hash],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Assigned Tab HOD', 'assigned.hod@umat.local', ?, 'HOD', ?, 'Assigned Tab Dept', 'Head of Assigned Tab Dept')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'HOD', faculty_key = VALUES(faculty_key)`,
      [HOD_ID, hash, facultyKey],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Assigned Tab Finance', 'assigned.fin@umat.local', ?, 'Finance', ?, 'Assigned Tab Finance', 'Faculty Accountant')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'Finance', faculty_key = VALUES(faculty_key)`,
      [FIN_ID, hash, facultyKey],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Assigned Tab Dean', 'assigned.dean@umat.local', ?, 'Dean', ?, 'Dean Office', 'Dean of Faculty')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'Dean', faculty_key = VALUES(faculty_key)`,
      [DEAN_ID, hash, facultyKey],
    );

    const fd = new FormData();
    fd.append('studentName', 'Assigned Tab Student');
    fd.append('studentIndex', STUDENT_INDEX);
    fd.append('isAnonymous', 'false');
    fd.append('subject', 'ASSIGN-TAB-VERIFY test complaint');
    fd.append('category', 'Academic & Exams');
    fd.append('urgency', 'Low');
    fd.append('description', 'Assigned-tab verification - safe to delete.');
    fd.append('programmeName', prog.name);
    const filed = await fetch(`${BASE}/api/complaints`, { method: 'POST', body: fd });
    const j = await filed.json();
    console.log('filed:', filed.status, j.id || JSON.stringify(j));
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
