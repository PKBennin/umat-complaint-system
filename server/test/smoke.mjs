// End-to-end smoke test against a running API (default http://localhost:4000).
// Run: node test/smoke.mjs
const BASE = process.env.API_BASE || 'http://localhost:4000';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// Multipart variant for endpoints that accept a file (complaint creation).
async function apiForm(method, path, { token, fields = {}, file } = {}) {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  if (file) formData.append('attachment', new Blob([file.content], { type: file.mimetype }), file.name);
  const res = await fetch(BASE + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  console.log(`\nUMaT API smoke test → ${BASE}\n`);

  // 1. Student login
  const login = await api('POST', '/api/auth/student/login', { body: { index_number: '9012870422', password: 'password123' } });
  check('student login 200', login.status === 200, `got ${login.status}`);
  check('student login returns token', !!login.json?.token);
  check('bad password rejected', (await api('POST', '/api/auth/student/login', { body: { index_number: '9012870422', password: 'wrong' } })).status === 401);
  const sToken = login.json.token;

  // 2. Create an Academic complaint for a FCMS programme (routes to Dean PS102).
  // Filing is public (no token) per the frontend's "instant public filings" FAQ.
  const created = await api('POST', '/api/complaints', {
    body: {
      studentName: 'Bennin Paa Kofi',
      studentIndex: '9012870422',
      subject: 'Missing Grade for CSE 352',
      category: 'Academic & Exams',
      urgency: 'High',
      description: 'My grades for Database Systems have not been posted on my dashboard.',
      programmeName: 'BSc Computer Science and Engineering',
    },
  });
  check('create complaint 201', created.status === 201, `got ${created.status} ${JSON.stringify(created.json)}`);
  check('unauthenticated filing succeeds (public filing)', created.status === 201);

  // 2b. Filing under a brand-new, unregistered index still succeeds (auto-provisioned).
  const anon = await api('POST', '/api/complaints', {
    body: {
      studentName: 'Kojo Anonymous',
      studentIndex: '9099999999',
      subject: 'Blocked from library WiFi',
      category: 'ICT & Portal Services',
      urgency: 'Low',
      description: 'The library WiFi rejects my device MAC address.',
      programmeName: 'BSc Cybersecurity',
    },
  });
  check('anonymous (unregistered index) filing succeeds', anon.status === 201, `got ${anon.status} ${JSON.stringify(anon.json)}`);
  check('anonymous filer cannot log in with a guessed password', (await api('POST', '/api/auth/student/login', { body: { index_number: '9099999999', password: 'password123' } })).status === 401);

  // 2c. File with a real attachment (multipart) — allowed type, under 5MB.
  const withAttachment = await apiForm('POST', '/api/complaints', {
    fields: {
      studentName: 'Isaac Mensah', studentIndex: '9010123456',
      subject: 'Damaged transcript request', category: 'Academic & Exams', urgency: 'Medium',
      description: 'Attaching my original transcript request receipt for reference.',
      programmeName: 'BSc Mathematics',
    },
    file: { name: 'receipt.pdf', mimetype: 'application/pdf', content: '%PDF-1.4 test attachment content' },
  });
  check('filing with attachment 201', withAttachment.status === 201, `got ${withAttachment.status} ${JSON.stringify(withAttachment.json)}`);
  check('attachment metadata recorded', withAttachment.json?.attachment?.originalName === 'receipt.pdf', JSON.stringify(withAttachment.json?.attachment));

  const attLogin = await api('POST', '/api/auth/student/login', { body: { index_number: '9010123456', password: 'password123' } });
  const attToken = attLogin.json.token;
  const dl = await fetch(`${BASE}/api/complaints/${withAttachment.json.id}/attachment`, { headers: { Authorization: `Bearer ${attToken}` } });
  check('owner can download attachment (200)', dl.status === 200, `got ${dl.status}`);
  const dlText = await dl.text();
  check('downloaded content matches upload', dlText.includes('test attachment content'), dlText);
  const dlNoAuth = await fetch(`${BASE}/api/complaints/${withAttachment.json.id}/attachment`);
  check('download without token is 401', dlNoAuth.status === 401, `got ${dlNoAuth.status}`);
  const wrongLogin = await api('POST', '/api/auth/student/login', { body: { index_number: '9012870422', password: 'password123' } });
  const dlWrongOwner = await fetch(`${BASE}/api/complaints/${withAttachment.json.id}/attachment`, { headers: { Authorization: `Bearer ${wrongLogin.json.token}` } });
  check('download by non-owner student is 403', dlWrongOwner.status === 403, `got ${dlWrongOwner.status}`);

  // 2d. Disallowed file type is rejected with 400, no complaint created.
  const badType = await apiForm('POST', '/api/complaints', {
    fields: {
      studentName: 'Bad File Tester', studentIndex: '9088888888',
      subject: 'Testing bad file type', category: 'Academic & Exams', urgency: 'Low',
      description: 'Should be rejected due to file type.', programmeName: 'BSc Mathematics',
    },
    file: { name: 'bad.exe', mimetype: 'application/x-msdownload', content: 'not allowed' },
  });
  check('disallowed file type rejected with 400', badType.status === 400, `got ${badType.status} ${JSON.stringify(badType.json)}`);

  const ticket = created.json;
  check('ticket has UMAT id', /^UMAT-2026-/.test(ticket?.id || ''), ticket?.id);
  check('routed to Prof. Anthony Simons', ticket?.assignedTo === 'Prof. Anthony Simons', ticket?.assignedTo);
  check('faculty resolved (FCMS)', ticket?.studentFacultyKey === 'FCMS', ticket?.studentFacultyKey);
  check('urgency Critical allowed in enum (High here)', ticket?.urgency === 'High');
  check('initial timeline entry present', (ticket?.timeline || []).length === 1);
  check('embedded arrays present', Array.isArray(ticket?.directives) && Array.isArray(ticket?.comments) && Array.isArray(ticket?.internalNotes));

  // 3. Student lists own complaints
  const mine = await api('GET', '/api/complaints/student/9012870422', { token: sToken });
  check('student list 200', mine.status === 200);
  check('student sees own ticket', (mine.json || []).some((c) => c.id === ticket.id));

  // RBAC: student cannot read another index's list
  check('student blocked from other index list', (await api('GET', '/api/complaints/student/9013456789', { token: sToken })).status === 403);

  // 4. Staff (Dean PS102, FCMS) login + scoped list
  const sfLogin = await api('POST', '/api/auth/staff/login', { body: { staff_id: 'PS102', password: 'password123' } });
  check('staff login 200', sfLogin.status === 200, `got ${sfLogin.status}`);
  const fToken = sfLogin.json.token;
  const inbox = await api('GET', '/api/complaints/staff/PS102', { token: fToken });
  check('staff scoped list includes ticket', (inbox.json || []).some((c) => c.id === ticket.id));

  // RBAC: a Dean of another faculty (PS101 / FMMT) must NOT see it
  const otherDean = await api('POST', '/api/auth/staff/login', { body: { staff_id: 'PS101', password: 'password123' } });
  const otherInbox = await api('GET', '/api/complaints/staff/PS101', { token: otherDean.json.token });
  check('out-of-scope dean does NOT see ticket', !(otherInbox.json || []).some((c) => c.id === ticket.id));
  check('out-of-scope dean cannot GET ticket', (await api('GET', `/api/complaints/${ticket.id}`, { token: otherDean.json.token })).status === 403);

  // 5. Claim → status Under Review
  const claimed = await api('POST', `/api/complaints/${ticket.id}/claim`, { token: fToken });
  check('claim sets Under Review', claimed.json?.status === 'Under Review', claimed.json?.status);

  // 6. Add directive → status In Progress
  const withDir = await api('POST', `/api/complaints/${ticket.id}/directives`, { token: fToken, body: { text: 'Bring printed grade slip to registry' } });
  check('directive added', (withDir.json?.directives || []).length === 1);
  check('status now In Progress', withDir.json?.status === 'In Progress', withDir.json?.status);

  // 7. Schedule appointment
  const appt = await api('POST', `/api/complaints/${ticket.id}/appointment`, {
    token: fToken,
    body: { type: 'in-person', dateTime: '2026-07-10 10:00', venue: "Dean's Office, Room 4", instructions: 'Bring ID card', checklist: ['Bring student ID card'] },
  });
  check('appointment scheduled', appt.json?.appointment?.status === 'Scheduled', JSON.stringify(appt.json?.appointment));

  // 8. Internal note (staff-only) + status update transactional
  await api('POST', `/api/complaints/${ticket.id}/notes`, { token: fToken, body: { message: 'Confirmed with registry — grade pending upload.' } });
  const resolved = await api('PUT', `/api/complaints/${ticket.id}/status`, { token: fToken, body: { status: 'Resolved', reason: 'Grade uploaded' } });
  check('status Resolved', resolved.json?.status === 'Resolved', resolved.json?.status);
  check('action log recorded status change', (resolved.json?.timeline || []).some((t) => /Resolved/.test(t.message)));

  // 9. Student sees the full picture, but NOT internal notes leaking into comments
  const studentView = await api('GET', `/api/complaints/${ticket.id}`, { token: sToken });
  check('student sees directive', (studentView.json?.directives || []).length === 1);
  check('student sees appointment', !!studentView.json?.appointment);
  check('internal notes REDACTED for student (not leaked over the wire)', (studentView.json?.internalNotes || []).length === 0);

  // Staff, by contrast, must see the internal note
  const staffView = await api('GET', `/api/complaints/${ticket.id}`, { token: fToken });
  check('staff sees internal note', (staffView.json?.internalNotes || []).length === 1, JSON.stringify(staffView.json?.internalNotes));

  // 10. Reminder
  const reminded = await api('POST', `/api/complaints/${ticket.id}/remind`, { token: sToken });
  check('reminder sets lastRemindedAt', !!reminded.json?.lastRemindedAt);

  console.log(`\n${fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('smoke test crashed:', e); process.exit(1); });
