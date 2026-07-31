// Live E2E: real student signup -> complete profile -> file complaint (with the
// new optional phone field) -> staff status update. Expect 2 SMS alerts to the
// configured phone. Test data is left in place until the user confirms receipt,
// then remove with: node scripts/e2e-sms-cleanup.js
// Usage: node scripts/e2e-sms.js <phone>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db.js');

const BASE = (process.env.API_BASE || 'https://umat-complaint-system.onrender.com').replace(/\/+$/, '');
const PHONE = process.argv[2] || '0550722898';
const INDEX = '7844551122';
const REF = '2045678901';
const PASSWORD = 'E2ETest#123';
const PROGRAMME = 'BSc Computer Science and Engineering';
const CATEGORY = 'Academic & Exams';
const SWEEP_STAFF_ID = 'SWEEPADMIN';
const ts = Date.now();
const EMAIL = `e2e.${ts}@st.umat.edu.gh`;

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
  return { status: res.status, data, text };
}

async function main() {
  console.log(`E2E SMS test on ${BASE} | phone ${PHONE} | student ${INDEX} | email ${EMAIL}\n`);

  const meta = await api('GET', '/api/meta');
  const programme = meta.data.programmes.find((p) => p.name === PROGRAMME) || meta.data.programmes[0];
  if (!programme) throw new Error('No programme found via /api/meta');
  console.log(`Programme: ${programme.name} (id=${programme.id})`);

  const signup = await api('POST', '/api/auth/student/signup', { json: { email: EMAIL, password: PASSWORD } });
  console.log(`1) signup: ${signup.status} ${signup.data && (signup.data.error || 'ok')}`);
  if (signup.status !== 200) return;
  const signupToken = signup.data.token;

  const profile = await api('POST', '/api/auth/student/complete-profile', {
    token: signupToken,
    json: {
      name: 'E2E SMS Test', index_number: INDEX, phone: PHONE, level: 'Level 200',
      programme_id: programme.id, reference_number: REF,
    },
  });
  console.log(`2) complete-profile (phone=${PHONE}): ${profile.status} ${profile.data && (profile.data.error || 'ok')}`);
  if (profile.status !== 200) return;
  const token = profile.data.token;

  const fd = new FormData();
  fd.append('studentName', 'E2E SMS Test');
  fd.append('studentIndex', INDEX);
  fd.append('isAnonymous', 'false');
  fd.append('subject', 'E2E SMS delivery test');
  fd.append('category', CATEGORY);
  fd.append('urgency', 'Low');
  fd.append('description', 'Live E2E SMS delivery test. Expect 2 SMS alerts to 0550722898. Safe to delete after confirmation.');
  fd.append('programmeName', PROGRAMME);
  fd.append('phone', PHONE);
  const filed = await api('POST', '/api/complaints', { token, form: fd });
  console.log(`3) file complaint (phone field sent): ${filed.status} ${filed.data && (filed.data.id || filed.data.error)}`);
  if (filed.status !== 201) return;
  const ticketId = filed.data.id;
  console.log(`   >>> TICKET: ${ticketId}`);

  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await conn.query(
      `INSERT INTO staff (staff_id, name, email, password_hash, type, department_label)
       VALUES (?, 'E2E Staff', 'e2e.staff@umat.local', ?, 'SuperAdmin', 'E2E Unit')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), type = 'SuperAdmin'`,
      [SWEEP_STAFF_ID, hash],
    );
  } finally { conn.release(); }

  const staffLogin = await api('POST', '/api/auth/staff/login', { json: { staff_id: SWEEP_STAFF_ID, password: PASSWORD } });
  console.log(`4) staff login: ${staffLogin.status}`);
  if (staffLogin.status === 200) {
    const status = await api('PUT', `/api/complaints/${ticketId}/status`, {
      token: staffLogin.data.token,
      json: { status: 'In Progress', reason: 'E2E SMS delivery test' },
    });
    console.log(`5) status -> In Progress (2nd SMS): ${status.status} ${status.data && (status.data.id || status.data.error)}`);
  } else {
    console.log(`5) status update skipped: ${staffLogin.data && staffLogin.data.error}`);
  }

  const login = await api('POST', '/api/auth/student/login', { json: { index_number: INDEX, password: PASSWORD } });
  console.log(`6) student login with real index: ${login.status} phone=${login.data && login.data.student && login.data.student.phone}`);

  console.log(`\n=== E2E COMPLETE ===`);
  console.log(`Ticket: ${ticketId} | Phone: ${PHONE}`);
  console.log(`Expect 2 SMS alerts (filing + In Progress).`);
  console.log(`Track: ${BASE.replace('/api', '')}/#track or student portal (index ${INDEX}, pass ${PASSWORD})`);
  console.log(`Cleanup later: node scripts/e2e-sms-cleanup.js`);
  await pool.end();
}

main().catch((e) => { console.error('E2E CRASHED:', e); process.exit(1); });
