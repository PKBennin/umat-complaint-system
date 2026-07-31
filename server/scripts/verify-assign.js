// Verifies HOD -> assignee visibility fix: complaint assigned by HOD must appear
// on the Finance officer's AND Counsellor's staff dashboards (server scope).
// Usage: node scripts/verify-assign.js
// Cleanup: node scripts/verify-assign-cleanup.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db.js');

const BASE = (process.env.API_BASE || 'https://umat-complaint-system.onrender.com').replace(/\/+$/, '');
const PASSWORD = 'VerifyPass#123';
const STUDENT_INDEX = '6677889911';
const HOD_ID = 'TESTHOD';
const FIN_ID = 'TESTFIN';
const COUN_ID = 'TESTCOUN';
const failures = [];
let ticketId = null;

async function api(method, p, { token, form, json } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body;
  if (form) body = form;
  else if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${p}`, { method, headers, body });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { }
      return { status: res.status, data, text };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error('network failure');
}

async function check(label, condition, detail) {
  if (condition) console.log(`[PASS] ${label}${detail ? ` (${detail})` : ''}`);
  else { failures.push(label); console.log(`[FAIL] ${label}${detail ? ` (${detail})` : ''}`); }
}

async function seed() {
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
    if (!prog) throw new Error(`No programme found for faculty ${facultyKey}`);
    console.log(`Faculty without HOD: ${facultyKey} | Programme: ${prog.name} (id=${prog.id})`);

    const hash = await bcrypt.hash(PASSWORD, 10);
    await conn.query(
      `INSERT INTO students (index_number, name, email, phone, password_hash, level, is_profile_complete)
       VALUES (?, 'Assign Verify Student', 'assign.verify.6677889911@student.umat.edu.gh', 'N/A', ?, 'Level 100', 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
      [STUDENT_INDEX, hash],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Verify HOD', 'verify.hod@umat.local', ?, 'HOD', ?, 'Verify Dept', 'Head of Verify Dept')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'HOD', faculty_key = VALUES(faculty_key)`,
      [HOD_ID, hash, facultyKey],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio)
       VALUES (?, 'Verify Finance', 'verify.fin@umat.local', ?, 'Finance', ?, 'Verify Finance Office', 'Faculty Accountant')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'Finance', faculty_key = VALUES(faculty_key)`,
      [FIN_ID, hash, facultyKey],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, department_label, portfolio)
       VALUES (?, 'Verify Counsellor', 'verify.coun@umat.local', ?, 'Counsellor', 'Guidance & Counselling Unit', 'Guidance & Counselling Unit')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'Counsellor'`,
      [COUN_ID, hash],
    );
    return { facultyKey, programme: prog.name };
  } finally {
    conn.release();
  }
}

async function main() {
  const { facultyKey, programme } = await seed();

  const fd = new FormData();
  fd.append('studentName', 'Assign Verify Student');
  fd.append('studentIndex', STUDENT_INDEX);
  fd.append('isAnonymous', 'false');
  fd.append('subject', 'ASSIGN-VERIFY test complaint');
  fd.append('category', 'Academic & Exams');
  fd.append('urgency', 'Low');
  fd.append('description', 'Assignment visibility verification - safe to delete.');
  fd.append('programmeName', programme);
  const filed = await api('POST', '/api/complaints', { form: fd });
  ticketId = filed.data && filed.data.id;
  check('file complaint (routed to test HOD)', filed.status === 201 && !!ticketId, ticketId || filed.data && filed.data.error);
  if (!ticketId) { console.log('Aborting.'); return; }

  const hodLogin = await api('POST', '/api/auth/staff/login', { json: { staff_id: HOD_ID, password: PASSWORD } });
  const hodToken = hodLogin.data && hodLogin.data.token;
  check('HOD login', hodLogin.status === 200 && !!hodToken);
  if (!hodToken) { console.log('Aborting.'); return; }

  const hodList = await api('GET', '/api/complaints/staff/TESTHOD', { token: hodToken });
  const hodSees = hodList.data && hodList.data.some((c) => c.id === ticketId);
  check('HOD inbox contains the complaint (faculty scope)', hodList.status === 200 && hodSees);

  const a1 = await api('POST', `/api/complaints/${ticketId}/assign`, { token: hodToken, json: { assignedStaffId: FIN_ID } });
  check('HOD assigns -> Finance', a1.status === 200);

  const finLogin = await api('POST', '/api/auth/staff/login', { json: { staff_id: FIN_ID, password: PASSWORD } });
  const finToken = finLogin.data && finLogin.data.token;
  check('Finance login', finLogin.status === 200 && !!finToken);
  if (finToken) {
    const finList = await api('GET', '/api/complaints/staff/TESTFIN', { token: finToken });
    const finSees = finList.data && finList.data.some((c) => c.id === ticketId);
    check('Finance dashboard shows the assigned complaint (SERVER FIX)', finList.status === 200 && finSees, finSees ? 'found' : 'NOT found');
  }

  const a2 = await api('POST', `/api/complaints/${ticketId}/assign`, { token: hodToken, json: { assignedStaffId: COUN_ID } });
  check('HOD assigns -> Counsellor', a2.status === 200);

  const counLogin = await api('POST', '/api/auth/staff/login', { json: { staff_id: COUN_ID, password: PASSWORD } });
  const counToken = counLogin.data && counLogin.data.token;
  check('Counsellor login', counLogin.status === 200 && !!counToken);
  if (counToken) {
    const counList = await api('GET', '/api/complaints/staff/TESTCOUN', { token: counToken });
    const counSees = counList.data && counList.data.some((c) => c.id === ticketId);
    check('Counsellor dashboard shows the assigned complaint (SERVER FIX)', counList.status === 200 && counSees, counSees ? 'found' : 'NOT found');
  }

  console.log(`\nTicket: ${ticketId} | faculty: ${facultyKey}`);
  console.log(failures.length === 0 ? 'ALL ASSIGN-VISIBILITY CHECKS PASS' : `FAILURES (${failures.length}):\n${failures.map(f => '  - ' + f).join('\n')}`);
  console.log('Cleanup later: node scripts/verify-assign-cleanup.js');
  await pool.end();
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(1); });
