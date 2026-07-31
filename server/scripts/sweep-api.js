// Non-destructive endpoint sweep against the deployed API.
// Seeds a disposable student + SuperAdmin, probes every route the frontend
// uses, then deletes all test data (best-effort in finally).
// Usage: node scripts/sweep-api.js          (targets deployed API)
//        API_BASE=http://localhost:4000 node scripts/sweep-api.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../db.js');

const BASE = (process.env.API_BASE || 'https://umat-complaint-system.onrender.com').replace(/\/+$/, '');
const SWEEP_STUDENT_INDEX = '5588772211';
const SWEEP_STAFF_ID = 'SWEEPADMIN';
const SWEEP_THROW_STAFF_ID = 'SWEEPTHROW';
const PASSWORD = 'SweepPass#123';
const PROGRAMME = 'BSc Computer Science and Engineering';
const CATEGORY = 'Academic & Exams';

const failures = [];
let complaintId = null;
let did = null;

async function api(method, p, { token, form, json, raw } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body;
  if (form) {
    body = form;
  } else if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (raw) {
    body = raw;
  }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${p}`, { method, headers, body });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* non-JSON */ }
      return { status: res.status, data, text };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function probe(name, fn, expect) {
  try {
    const { status, data, text } = await fn();
    const ok = (typeof expect === 'function') ? expect(status, data) : status === expect;
    const summary = data ? (data.error || data.ok || (data.id ? `id=${data.id}` : 'ok')) : (text || '').slice(0, 60);
    if (ok) {
      console.log(`[PASS] ${name} -> ${status} ${summary}`);
    } else {
      failures.push(name);
      console.log(`[FAIL] ${name} -> ${status} (expected ${expect}) ${summary}`);
    }
    return { status, data, text };
  } catch (e) {
    failures.push(name);
    console.log(`[FAIL] ${name} -> EXCEPTION ${e.message}`);
    return null;
  }
}

async function seed() {
  const conn = await pool.getConnection();
  try {
    const [[prog]] = await conn.query('SELECT id FROM programmes WHERE name = ? LIMIT 1', [PROGRAMME]);
    const programmeId = prog ? prog.id : (await conn.query('SELECT id FROM programmes LIMIT 1'))[0][0].id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    await conn.query(
      `INSERT INTO students (index_number, name, email, phone, password_hash, level, programme_id, is_profile_complete)
       VALUES (?, 'Sweep Test Student', 'sweep.5588772211@student.umat.edu.gh', 'N/A', ?, 'Level 300', ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = 'N/A',
         password_hash = VALUES(password_hash), is_profile_complete = 1`,
      [SWEEP_STUDENT_INDEX, hash, programmeId],
    );
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, department_label)
       VALUES (?, 'Sweep Test Admin', 'sweep.admin@umat.local', ?, 'SuperAdmin', 'Sweep Unit')
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), type = 'SuperAdmin'`,
      [SWEEP_STAFF_ID, hash],
    );
    const [[types]] = await conn.query('SELECT GROUP_CONCAT(DISTINCT type) AS t FROM staff');
    console.log(`Seeded student ${SWEEP_STUDENT_INDEX} + staff ${SWEEP_STAFF_ID}. Existing staff types: ${types ? types.t : '(none)'}`);
  } finally {
    conn.release();
  }
}

async function cleanup() {
  console.log('\n--- Cleanup ---');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const t = await (await fetch(`${BASE}/api/auth/staff/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_id: SWEEP_STAFF_ID, password: PASSWORD }),
        })).json();
        if (t && t.token) {
          const del = await api('DELETE', `/api/complaints/${complaintId || 'UMAT-2026-NONE'}`, { token: t.token });
          console.log(`SuperAdmin complaint delete: ${del.status} ${del.data ? JSON.stringify(del.data) : ''}`);
        }
        break;
      } catch (e) {
        if (attempt === 2) console.log(`Complaint cleanup skip: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (e) { console.log(`Complaint cleanup skip: ${e.message}`); }

  try {
    const conn = await pool.getConnection();
    try {
      const [dComp] = await conn.query("DELETE FROM complaints WHERE subject LIKE 'Sweep E2E%'");
      const [dStaff] = await conn.query('DELETE FROM staff WHERE staff_id IN (?, ?)', [SWEEP_STAFF_ID, SWEEP_THROW_STAFF_ID]);
      const [dStud] = await conn.query('DELETE FROM students WHERE index_number = ?', [SWEEP_STUDENT_INDEX]);
      const [[counts]] = await conn.query(
        "SELECT (SELECT COUNT(*) FROM staff WHERE staff_id IN (?, ?)) AS staffLeft, (SELECT COUNT(*) FROM students WHERE index_number = ?) AS studLeft, (SELECT COUNT(*) FROM complaints WHERE subject LIKE 'Sweep E2E%') AS compLeft",
        [SWEEP_STAFF_ID, SWEEP_THROW_STAFF_ID, SWEEP_STUDENT_INDEX],
      );
      console.log(`SQL cleanup: staff rows=${dStaff.affectedRows}, student rows=${dStud.affectedRows}, stray sweep complaints=${dComp.affectedRows}`);
      console.log(`Post-cleanup residual -> staff:${counts.staffLeft} students:${counts.studLeft} sweep complaints:${counts.compLeft}`);
    } catch (e) {
      console.log(`SQL cleanup failed: ${e.message}`);
    } finally {
      conn.release();
    }
  } catch (e) {
    console.log(`DB cleanup connection failed: ${e.message}`);
  }
  await pool.end();
}

async function main() {
  console.log(`Sweeping ${BASE}\n`);
  await seed();
  await probe('GET /api/health (no auth)', () => api('GET', '/api/health'), 200);
  await probe('GET /api/meta (no auth)', () => api('GET', '/api/meta'), 200);
  await probe('GET /api/auth/students (no token -> 401/403)', () => api('GET', '/api/auth/students'), (s) => s === 401 || s === 403);
  await probe('GET /api/nonexistent (404)', () => api('GET', '/api/does-not-exist'), 404);

  const sLogin = await probe('POST /api/auth/student/login', () =>
    api('POST', '/api/auth/student/login', { json: { index_number: SWEEP_STUDENT_INDEX, password: PASSWORD } }), 200);
  const studentToken = sLogin && sLogin.data && sLogin.data.token;
  if (!studentToken) { failures.push('student login token'); console.log('Aborting: could not log in as sweep student'); return; }
  const st = (o = {}) => ({ token: studentToken, ...o });

  const aLogin = await probe('POST /api/auth/staff/login', () =>
    api('POST', '/api/auth/staff/login', { json: { staff_id: SWEEP_STAFF_ID, password: PASSWORD } }), 200);
  const staffToken = aLogin && aLogin.data && aLogin.data.token;
  if (!staffToken) { failures.push('staff login token'); console.log('Aborting: could not log in as sweep staff'); return; }
  const at = (o = {}) => ({ token: staffToken, ...o });

  await probe('GET /api/complaints/student/:index (own)', () => api('GET', `/api/complaints/student/${SWEEP_STUDENT_INDEX}`, st()), 200);

  const fd = new FormData();
  fd.append('studentName', 'Sweep Test Student');
  fd.append('studentIndex', SWEEP_STUDENT_INDEX);
  fd.append('subject', 'Sweep E2E Test Complaint');
  fd.append('category', CATEGORY);
  fd.append('urgency', 'Low');
  fd.append('description', 'Automated endpoint sweep test complaint - deleted after the sweep.');
  fd.append('programmeName', PROGRAMME);
  fd.append('isAnonymous', 'false');
  fd.append('attachment', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c62600100000500010d0a2db40000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'sweep-attachment.png');
  const create = await probe('POST /api/complaints (multipart + attachment)', () => api('POST', '/api/complaints', st({ form: fd })), 201);
  complaintId = create && create.data && create.data.id;

  if (!complaintId) {
    failures.push('complaint creation');
    console.log('Aborting: complaint not created');
    return;
  }
  console.log(`  ticket = ${complaintId}`);

  await probe('GET /api/complaints/:id/attachment', () => api('GET', `/api/complaints/${complaintId}/attachment`, st()), 200);
  await probe('GET /api/complaints/:id (owner)', () => api('GET', `/api/complaints/${complaintId}`, st()), 200);
  await probe('GET /api/complaints/public/track/:id (no auth)', () => api('GET', `/api/complaints/public/track/${complaintId}`), 200);
  await probe('POST /api/complaints/:id/remind (student)', () => api('POST', `/api/complaints/${complaintId}/remind`, st()), 200);
  await probe('GET /api/complaints/:id/comments', () => api('GET', `/api/complaints/${complaintId}/comments`, st()), 200);
  await probe('POST /api/complaints/:id/comments (student)', () => api('POST', `/api/complaints/${complaintId}/comments`, st({ json: { message: 'Sweep: student reply' } })), 201);
  await probe('PUT /api/auth/student/password (wrong current -> 401)', () => api('PUT', '/api/auth/student/password', st({ json: { currentPassword: 'wrong', newPassword: 'x1xx' } })), 401);
  await probe('PUT /api/auth/student/profile', () => api('PUT', '/api/auth/student/profile', st({ json: { phone: 'N/A', email: 'sweep.5588772211@student.umat.edu.gh' } })), 200);

  await probe('GET /api/complaints/staff/:staffId', () => api('GET', `/api/complaints/staff/${SWEEP_STAFF_ID}`, at()), 200);
  await probe('GET /api/complaints/:id/eligible-officers', () => api('GET', `/api/complaints/${complaintId}/eligible-officers`, at()), 200);
  const officers = await probe('GET /api/complaints/faculty/:key/officers (counsellor list)', () => api('GET', '/api/complaints/faculty/FCMS/officers', at()), 200);
  if (officers && officers.data) {
    console.log(`  [INFO] faculty officers returned: ${Array.isArray(officers.data) ? officers.data.length : 'n/a'} (counsellors: ${Array.isArray(officers.data) ? officers.data.filter(o => o.type === 'Counsellor').length : 'n/a'})`);
  }
  await probe('POST /api/complaints/:id/claim', () => api('POST', `/api/complaints/${complaintId}/claim`, at()), 200);
  await probe('PUT /api/complaints/:id/status (In Progress)', () => api('PUT', `/api/complaints/${complaintId}/status`, at({ json: { status: 'In Progress', operator_name: 'Sweep Admin' } })), 200);
  await probe('PUT /api/complaints/:id/status (Resolved)', () => api('PUT', `/api/complaints/${complaintId}/status`, at({ json: { status: 'Resolved', reason: 'Sweep test resolution' } })), 200);
  await probe('POST /api/complaints/:id/notes', () => api('POST', `/api/complaints/${complaintId}/notes`, at({ json: { message: 'Sweep: internal note' } })), 201);
  await probe('POST /api/complaints/:id/comments (staff + isAdmin)', () => api('POST', `/api/complaints/${complaintId}/comments`, at({ json: { message: 'Sweep: staff reply', isAdmin: true } })), 201);
  const dir = await probe('POST /api/complaints/:id/directives', () => api('POST', `/api/complaints/${complaintId}/directives`, at({ json: { text: 'Sweep: action item' } })), 201);
  if (dir && dir.data && Array.isArray(dir.data.directives) && dir.data.directives.length > 0) did = dir.data.directives[0].id;
  if (did) {
    await probe('PUT /api/complaints/:id/directives/:did', () => api('PUT', `/api/complaints/${complaintId}/directives/${did}`, at({ json: { completed: true } })), 200);
    await probe('DELETE /api/complaints/:id/directives/:did', () => api('DELETE', `/api/complaints/${complaintId}/directives/${did}`, at()), 200);
  } else {
    failures.push('directive create (id missing)');
  }
  await probe('POST /api/complaints/:id/appointment (singular)', () => api('POST', `/api/complaints/${complaintId}/appointment`, at({ json: { type: 'Counseling Session', dateTime: '2026-08-05T10:00:00Z', venue: 'Guidance Office', instructions: 'Sweep test' } })), 201);
  await probe('PUT /api/complaints/:id/appointment (complete)', () => api('PUT', `/api/complaints/${complaintId}/appointment`, at({ json: { feedback: 'Sweep: attended' } })), 200);
  await probe('POST /api/complaints/:id/appointments (PLURAL -> expect 404 bug)', () => api('POST', `/api/complaints/${complaintId}/appointments`, at({ json: { type: 'Counseling Session', dateTime: '2026-08-05T10:00:00Z', venue: 'Guidance Office' } })), 404);
  await probe('POST /api/complaints/:id/assign', () => api('POST', `/api/complaints/${complaintId}/assign`, at({ json: { assignedStaffId: SWEEP_STAFF_ID } })), 200);
  await probe('POST /api/complaints/bulk-assign', () => api('POST', '/api/complaints/bulk-assign', at({ json: { ids: [complaintId], assignedStaffId: SWEEP_STAFF_ID } })), 200);
  await probe('GET /api/complaints/dean-summary (SuperAdmin)', () => api('GET', '/api/complaints/dean-summary', at()), 200);
  await probe('GET /api/complaints/dean-summary (student -> 403)', () => api('GET', '/api/complaints/dean-summary', st()), 403);

  await probe('GET /api/meta/admin-dashboard', () => api('GET', '/api/meta/admin-dashboard', at()), 200);
  await probe('GET /api/auth/staff (list)', () => api('GET', '/api/auth/staff', at()), 200);
  await probe('GET /api/auth/students (list)', () => api('GET', '/api/auth/students', at()), 200);
  await probe('POST /api/auth/staff (empty body -> 400)', () => api('POST', '/api/auth/staff', at({ json: {} })), 400);
  await probe('POST /api/auth/staff (invalid type -> 400)', () => api('POST', '/api/auth/staff', at({ json: { staff_id: 'X1', name: 'X', password: '1234', type: 'Counsellor', portfolio: 'X' } })), 400);
  await probe('POST /api/auth/staff (valid -> create throwaway)', () => api('POST', '/api/auth/staff', at({ json: { staff_id: SWEEP_THROW_STAFF_ID, name: 'Sweep Throwaway', password: PASSWORD, type: 'IT', portfolio: 'Sweep' } })), 200);
  await probe('DELETE /api/auth/staff/:id (delete throwaway)', () => api('DELETE', `/api/auth/staff/${SWEEP_THROW_STAFF_ID}`, at()), 200);
  await probe('POST /api/auth/staff/bulk-delete (empty -> 400)', () => api('POST', '/api/auth/staff/bulk-delete', at({ json: { ids: [] } })), 400);
  await probe('POST /api/auth/students/bulk-delete (empty -> 400)', () => api('POST', '/api/auth/students/bulk-delete', at({ json: { ids: [] } })), 400);
  await probe('PUT /api/auth/staff/password (wrong current, 2-char pw -> 400?)', () => api('PUT', '/api/auth/staff/password', at({ json: { currentPassword: 'wrong', newPassword: 'x1' } })), (s) => s === 401 || s === 400);
  await probe('PUT /api/auth/staff/password (wrong current, 16-char pw -> 401?)', () => api('PUT', '/api/auth/staff/password', at({ json: { currentPassword: 'wrong', newPassword: 'SweepPass#123456' } })), (s) => s === 401 || s === 400);
  await probe('PUT /api/auth/staff/password (correct current, same pw -> 200?)', () => api('PUT', '/api/auth/staff/password', at({ json: { currentPassword: PASSWORD, newPassword: PASSWORD } })), (s) => s === 200 || s === 400);
  await probe('PUT /api/auth/staff/profile', () => api('PUT', '/api/auth/staff/profile', at({ json: { email: 'sweep.admin@umat.local' } })), 200);

  console.log(`\n==================== SWEEP RESULT ====================`);
  console.log(failures.length === 0 ? 'ALL ENDPOINTS PASS' : `FAILURES (${failures.length}):\n${failures.map(f => '  - ' + f).join('\n')}`);
}

main()
  .catch((e) => { console.error('SWEEP CRASHED:', e); failures.push('crash'); })
  .finally(() => cleanup().catch((e) => console.error('CLEANUP CRASHED:', e.message)));
