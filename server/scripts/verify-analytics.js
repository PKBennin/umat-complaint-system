// Seeds a department-analytics mismatch replica: HOD whose department_label uses
// the "&" spelling ("Computer Science & Engineering") while the departments table
// uses "Department of Computer Science and Engineering". Files 3 complaints under
// that department and resolves 1, so the analytics dash has data to show.
// Usage: node scripts/verify-analytics.js | cleanup: node scripts/verify-analytics-cleanup.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db.js');

const BASE = (process.env.API_BASE || 'https://umat-complaint-system.onrender.com').replace(/\/+$/, '');
const PASSWORD = 'AnalyticsPass#1';
const HOD_ID = 'TESTHODB';
const STUDENTS = [
  { index: '8899001122', name: 'Analytics Student One', prog: 'BSc Computer Science and Engineering' },
  { index: '8899001133', name: 'Analytics Student Two', prog: 'BSc Robotics Engineering and Artificial Intelligence' },
  { index: '8899001144', name: 'Analytics Student Three', prog: 'BSc Telecommunication Engineering' },
];

async function api(method, p, { token, form, json } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body;
  if (form) body = form;
  else if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const res = await fetch(`${BASE}${p}`, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { }
  return { status: res.status, data };
}

(async () => {
  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Analytics Verify HOD', 'analytics.hod@umat.local', ?, 'HOD', 'FCaMS', 'Computer Science & Engineering', 'Head of Computer Science & Engineering')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'HOD', faculty_key = 'FCaMS', department_label = 'Computer Science & Engineering'`,
      [HOD_ID, hash],
    );
    for (const s of STUDENTS) {
      await conn.query(
        `INSERT INTO students (index_number, name, email, phone, password_hash, level, is_profile_complete)
         VALUES (?, ?, CONCAT('analytics.', ?, '@student.umat.edu.gh'), 'N/A', ?, 'Level 200', 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
        [s.index, s.name, s.index, hash],
      );
    }
    const login = await api('POST', '/api/auth/staff/login', { json: { staff_id: HOD_ID, password: PASSWORD } });
    if (!login.data.token) throw new Error('HOD login failed: ' + JSON.stringify(login.data));

    const ids = [];
    for (const s of STUDENTS) {
      const fd = new FormData();
      fd.append('studentName', s.name);
      fd.append('studentIndex', s.index);
      fd.append('isAnonymous', 'false');
      fd.append('subject', 'ANALYTICS-VERIFY complaint from ' + s.prog);
      fd.append('category', 'Academic & Exams');
      fd.append('urgency', 'Medium');
      fd.append('description', 'Department analytics verification - safe to delete.');
      fd.append('programmeName', s.prog);
      const filed = await api('POST', '/api/complaints', { form: fd });
      if (!filed.data || !filed.data.id) throw new Error('filing failed: ' + JSON.stringify(filed.data));
      ids.push(filed.data.id);
      console.log('filed', filed.data.id, '->', s.prog);
    }

    const upd = await api('PUT', `/api/complaints/${ids[0]}/status`, { token: login.data.token, json: { status: 'Resolved', note: 'Analytics verification resolution' } });
    console.log('resolve', ids[0], '->', upd.status);
    console.log('tickets:', ids.join(', '));
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
