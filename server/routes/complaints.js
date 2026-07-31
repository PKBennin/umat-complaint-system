// Complaint lifecycle endpoints (PDF §4.2–4.4 + superset for directives/notes).
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const {
  verifyJWT, requireStudent, requireStaff, staffScopeClause, staffCanAccessComplaint,
} = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { computeRouting } = require('../utils/routing');
const { assembleComplaint, assembleMany, LIST_SELECT, redactForStudent } = require('../utils/mappers');

const router = express.Router();

function validationGuard(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return true;
  }
  return false;
}

async function checkAndAlertStaffUnattended(conn, staffId) {
  if (!staffId) return;
  const [[countRow]] = await conn.query(
    "SELECT COUNT(*) AS count FROM complaints WHERE assigned_staff_id = ? AND status = 'Submitted'",
    [staffId]
  );
  const unattendedCount = countRow ? countRow.count : 0;
  
  if (unattendedCount > 0 && unattendedCount % 10 === 0) {
    const [[staffRow]] = await conn.query(
      "SELECT email, name FROM staff WHERE staff_id = ?",
      [staffId]
    );
    if (staffRow && staffRow.email) {
      const { sendEmail } = require('../utils/email');
      const staffMsg = `Hello ${staffRow.name}, you have ${unattendedCount} unattended complaints pending on your desk. Please log in to the administrator portal to review them.`;
      sendEmail({
        to: staffRow.email,
        subject: `Urgent: ${unattendedCount} Unattended Complaints Pending`,
        text: staffMsg
      }).catch((err) => console.error('[Staff Email Alert Error]', err.message));
    }
  }
}

// Generate a UMAT ticket id, retrying on the (unlikely) collision.
async function generateTicketId(conn) {
  for (let i = 0; i < 5; i++) {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const id = `UMAT-2026-${suffix}`;
    const [[hit]] = await conn.query('SELECT 1 AS x FROM complaints WHERE id = ?', [id]);
    if (!hit) return id;
  }
  throw new Error('Could not allocate a unique ticket id');
}

async function addLog(conn, complaintId, operator, action, message) {
  await conn.query(
    'INSERT INTO action_logs (complaint_id, operator_name, action_type, details) VALUES (?, ?, ?, ?)',
    [complaintId, operator, action, message],
  );
}

// Loads the raw complaint row (for access checks). 404 if missing.
async function loadRawComplaint(id) {
  const [[row]] = await pool.query('SELECT * FROM complaints WHERE id = ?', [id]);
  return row || null;
}

// --- middleware: attach + authorize a complaint by :id -----------------------
async function attachComplaintForStudent(req, res, next) {
  const row = await loadRawComplaint(req.params.id);
  if (!row) return res.status(404).json({ error: 'Complaint not found' });
  if (row.student_index !== req.user.index) return res.status(403).json({ error: 'Not your complaint' });
  req.complaintRow = row;
  return next();
}
async function attachComplaintForStaff(req, res, next) {
  const row = await loadRawComplaint(req.params.id);
  if (!row) return res.status(404).json({ error: 'Complaint not found' });
  if (!staffCanAccessComplaint(req.user, row)) return res.status(403).json({ error: 'Outside your jurisdiction' });
  req.complaintRow = row;
  return next();
}

// Ensures a students row exists for this index so the complaint's FK is
// satisfiable. Filing is public (per the frontend FAQ: "no account required"),
// so an index typed by a first-time filer won't be in the students table yet.
// We auto-provision a minimal record with a random, unguessable password hash
// (never derived from the index) — the filer can still submit and receive a
// ticket, but cannot log in to track it unless they separately hold real
// credentials for that index. If the index already belongs to a real account,
// that account (and its real password) is left untouched.
async function ensureStudentRecord(conn, { index, name }) {
  const [[existing]] = await conn.query('SELECT index_number FROM students WHERE index_number = ?', [index]);
  if (existing) return;
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(randomPassword, 10);
  await conn.query(
    `INSERT INTO students (index_number, name, email, phone, password_hash, level)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [index, name, `${index}@student.umat.edu.gh`, 'N/A', hash, 'N/A'],
  );
}

// Wraps multer so upload errors (bad mimetype, over 5MB) come back as a
// normal 400 JSON response instead of Express's default error page.
function handleAttachmentUpload(req, res, next) {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'File upload failed' });
    return next();
  });
}

// Deletes an uploaded file from disk — used to clean up after a request that
// saved an attachment but then failed validation/routing further down.
function deleteUploadedFile(file) {
  if (!file) return;
  fs.unlink(file.path, () => {}); // best-effort; ignore errors
}

// =============================================================================
// CREATE — public filing, no login required (matches the frontend's "instant
// public filings" FAQ). If a valid student bearer token is present it is
// ignored for identity purposes: the form's typed name/index is authoritative,
// exactly as the original client-side implementation behaved. Accepts an
// optional multipart "attachment" file (image/PDF/Word doc, max 5MB).
// POST /api/complaints
// =============================================================================
router.post('/', handleAttachmentUpload,
  body('studentName').isString().trim().notEmpty(),
  body('studentIndex').isString().trim().matches(/^[0-9]{10}$/).withMessage('Index must be exactly 10 digits'),
  body('subject').isString().trim().notEmpty(),
  body('category').isString().trim().notEmpty(),
  body('urgency').isIn(['Low', 'Medium', 'High', 'Urgent', 'Critical']),
  body('description').isString().trim().notEmpty(),
  body('programmeName').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (validationGuard(req, res)) { deleteUploadedFile(req.file); return; }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const { studentName, studentIndex, subject, category, urgency, description, programmeName } = req.body;
      // Sent as a FormData string ('true'/'false'), not a real boolean.
      const isAnonymous = req.body.isAnonymous === 'true';
      console.log('[API POST /api/complaints] Parsed Body:', { studentName, studentIndex, subject, category, urgency, description, programmeName, isAnonymous });
      const routing = await computeRouting(conn, category, programmeName);
      if (!routing.categoryId || !routing.programmeId) {
        await conn.rollback();
        deleteUploadedFile(req.file);
        return res.status(400).json({ error: 'Unknown category or programme' });
      }
      await ensureStudentRecord(conn, { index: studentIndex, name: studentName });
      const id = await generateTicketId(conn);
      const file = req.file;
      await conn.query(
        `INSERT INTO complaints
           (id, student_index, is_anonymous, subject, category_id, urgency, description, status,
            hod_staff_id, assigned_staff_id, programme_id, routing_dept, faculty_key,
            attachment_stored_name, attachment_original_name, attachment_mimetype, attachment_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, studentIndex, isAnonymous ? 1 : 0, subject, routing.categoryId, urgency, description,
          routing.hodStaffId, routing.assignedStaffId, routing.programmeId, routing.routingDept, routing.facultyKey,
          file ? file.filename : null, file ? file.originalname : null,
          file ? file.mimetype : null, file ? file.size : null],
      );
      await addLog(conn, id, 'System Engine', 'Complaint Submitted',
        `Complaint successfully registered under Ticket ID ${id} and routed to the ${routing.role}.`);
      await conn.commit();

      // Trigger real-time SMS & Email to student upon complaint filing
      const [[stRow]] = await conn.query('SELECT phone, name, email FROM students WHERE index_number = ?', [studentIndex]);
      if (stRow) {
        const smsMsg = `[UMaT CCM] Hello ${stRow.name}, your complaint "${subject}" has been received. Ticket ID: ${id}. We will get back to you shortly.`;
        const emailMsg = `Dear ${stRow.name},\n\nYour complaint has been successfully submitted to the UMaT Campus Complaint Management System.\n\nTicket ID: ${id}\nSubject: ${subject}\nPriority: ${urgency}\nStatus: Submitted\n\nYou can track your complaint progress at any time by signing in to the student portal.\n\nThank you,\nUMaT Campus Complaint Management System`;
        if (stRow.phone && stRow.phone !== 'N/A') {
          const { sendSMS } = require('../utils/sms');
          sendSMS(stRow.phone, smsMsg).catch((err) => console.error('[SMS Service Error]', err.message));
        }
        if (stRow.email) {
          const { sendEmail } = require('../utils/email');
          sendEmail({
            to: stRow.email,
            subject: `[UMaT CCM] Complaint Received — Ticket ${id}`,
            text: emailMsg
          }).catch((err) => console.error('[Email Service Error]', err.message));
        }
      }

      // Check and send unattended complaints notification to staff
      await checkAndAlertStaffUnattended(conn, routing.assignedStaffId);

      const complaint = await assembleComplaint(pool, id);
      return res.status(201).json(redactForStudent(complaint));
    } catch (e) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return next(e);
    } finally {
      conn.release();
    }
  });

// =============================================================================
// LIST (student, own)   GET /api/complaints/student/:index
// =============================================================================
router.get('/student/:index', verifyJWT, requireStudent, async (req, res, next) => {
  try {
    if (req.params.index !== req.user.index) return res.status(403).json({ error: 'Not your records' });
    const [rows] = await pool.query(
      `${LIST_SELECT} WHERE c.student_index = ? ORDER BY COALESCE(c.updated_at, c.created_at) DESC`,
      [req.user.index],
    );
    res.json((await assembleMany(pool, rows)).map(redactForStudent));
  } catch (e) { next(e); }
});

// =============================================================================
// LIST (staff, scoped)  GET /api/complaints/staff/:staffId
// =============================================================================
router.get('/staff/:staffId', verifyJWT, requireStaff, async (req, res, next) => {
  try {
    const scope = staffScopeClause(req.user);
    const [rows] = await pool.query(
      `${LIST_SELECT} WHERE ${scope.clause} ORDER BY COALESCE(c.updated_at, c.created_at) DESC`,
      scope.params,
    );
    res.json(await assembleMany(pool, rows));
  } catch (e) { next(e); }
});

// =============================================================================
// GET public track single complaint (does not require JWT/login)
// GET /api/complaints/public/track/:id
// =============================================================================
router.get('/public/track/:id', async (req, res, next) => {
  try {
    const row = await loadRawComplaint(req.params.id);
    if (!row) return res.status(404).json({ error: 'Complaint not found' });
    const assembled = await assembleComplaint(pool, req.params.id);
    // Redact internal notes and return for student tracking
    return res.json(redactForStudent(assembled));
  } catch (e) { next(e); }
});

// =============================================================================
// GET single (student own OR staff in-scope)  GET /api/complaints/:id
// =============================================================================
router.get('/:id', verifyJWT, async (req, res, next) => {
  try {
    const row = await loadRawComplaint(req.params.id);
    if (!row) return res.status(404).json({ error: 'Complaint not found' });
    const assembled = await assembleComplaint(pool, req.params.id);
    if (req.user.role === 'student') {
      if (row.student_index !== req.user.index) return res.status(403).json({ error: 'Not your complaint' });
      return res.json(redactForStudent(assembled));
    }
    if (!staffCanAccessComplaint(req.user, row)) {
      return res.status(403).json({ error: 'Outside your jurisdiction' });
    }
    return res.json(assembled);
  } catch (e) { next(e); }
});

// =============================================================================
// ATTACHMENT DOWNLOAD (student owner OR staff in-scope)
// GET /api/complaints/:id/attachment
// =============================================================================
router.get('/:id/attachment', verifyJWT, async (req, res, next) => {
  try {
    const row = await loadRawComplaint(req.params.id);
    if (!row) return res.status(404).json({ error: 'Complaint not found' });
    if (req.user.role === 'student' ? row.student_index !== req.user.index : !staffCanAccessComplaint(req.user, row)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!row.attachment_stored_name) return res.status(404).json({ error: 'No attachment on this complaint' });
    const filePath = path.join(UPLOAD_DIR, row.attachment_stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment file missing on server' });
    res.setHeader('Content-Type', row.attachment_mimetype || 'application/octet-stream');
    return res.download(filePath, row.attachment_original_name || row.attachment_stored_name);
  } catch (e) { return next(e); }
});

// =============================================================================
// CLAIM (staff)  POST /api/complaints/:id/claim
// =============================================================================
router.post('/:id/claim', verifyJWT, requireStaff, attachComplaintForStaff, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = req.complaintRow;
    await conn.query('UPDATE complaints SET assigned_staff_id = ? WHERE id = ?', [req.user.staffId, c.id]);
    await addLog(conn, c.id, req.user.name, 'Officer Assigned', `${req.user.name} claimed ownership of this complaint.`);
    if (c.status === 'Submitted') {
      await conn.query("UPDATE complaints SET status = 'Under Review' WHERE id = ?", [c.id]);
      await addLog(conn, c.id, req.user.name, 'Status Updated', 'Status advanced to Under Review.');
    }
    await conn.commit();
    res.json(await assembleComplaint(pool, c.id));
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// =============================================================================
// ELIGIBLE OFFICERS — staff members whose scope covers this complaint, for the
// "Reassign Case Officer" dropdown.  GET /api/complaints/:id/eligible-officers
// =============================================================================
router.get('/:id/eligible-officers', verifyJWT, requireStaff, attachComplaintForStaff, async (req, res, next) => {
  try {
    const c = req.complaintRow;
    const [rows] = await pool.query(
      'SELECT staff_id, name, type, faculty_key, department_label, portfolio FROM staff',
    );
    const eligible = rows.filter((s) => staffCanAccessComplaint(
      { type: s.type, facultyKey: s.faculty_key, departmentLabel: s.department_label }, c,
    ));
    res.json(eligible.map((s) => ({ staffId: s.staff_id, name: s.name, portfolio: s.portfolio })));
  } catch (e) { next(e); }
});

// =============================================================================
// STATUS / assignment (staff, transactional)  PUT /api/complaints/:id/status
// =============================================================================
router.put('/:id/status', verifyJWT, requireStaff, attachComplaintForStaff,
  body('status').optional().isIn(['Submitted', 'Under Review', 'In Progress', 'Resolved', 'Rejected']),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const c = req.complaintRow;
      const operator = req.body.operator_name || req.user.name;
      if (req.body.status && req.body.status !== c.status) {
        await conn.query('UPDATE complaints SET status = ? WHERE id = ?', [req.body.status, c.id]);
        const reason = req.body.reason ? ` — ${req.body.reason}` : '';
        await addLog(conn, c.id, operator, 'Status Updated', `Status changed from ${c.status} to ${req.body.status}${reason}.`);
      }
      if (req.body.assignedStaffId && req.body.assignedStaffId !== c.assigned_staff_id) {
        const [[targetStaff]] = await conn.query(
          'SELECT staff_id, name, type, faculty_key, department_label FROM staff WHERE staff_id = ?',
          [req.body.assignedStaffId],
        );
        const eligible = targetStaff && staffCanAccessComplaint(
          { type: targetStaff.type, facultyKey: targetStaff.faculty_key, departmentLabel: targetStaff.department_label }, c,
        );
        if (!eligible) {
          await conn.rollback();
          return res.status(400).json({ error: 'Selected officer is not eligible for this complaint.' });
        }
        await conn.query('UPDATE complaints SET assigned_staff_id = ? WHERE id = ?', [req.body.assignedStaffId, c.id]);
        await addLog(conn, c.id, operator, 'Officer Assigned', `Ticket reassigned to ${targetStaff.name}.`);
      }
      await conn.commit();

      // Trigger real-time SMS & Email on status update
      if (req.body.status && req.body.status !== c.status) {
        const [[stRow]] = await conn.query('SELECT phone, name, email FROM students WHERE index_number = ?', [c.student_index]);
        if (stRow) {
          const newStatus = req.body.status;
          const statusEmoji = { 'Under Review': '🔍', 'In Progress': '⚙️', 'Resolved': '✅', 'Rejected': '❌', 'Submitted': '📩' }[newStatus] || '📋';
          const reasonNote = req.body.reason ? ` Reason: ${req.body.reason}.` : '';
          const smsMsg = `[UMaT CCM] ${statusEmoji} Update on Ticket ${c.id}: Your complaint status has changed to "${newStatus}".${reasonNote} Log in to the student portal for details.`;
          const emailMsg = `Dear ${stRow.name},\n\nThis is an update on your complaint with UMaT Campus Complaint Management System.\n\nTicket ID: ${c.id}\nSubject: ${c.subject}\nPrevious Status: ${c.status}\nNew Status: ${newStatus}${reasonNote ? '\nReason: ' + req.body.reason : ''}\n\nPlease log in to the student portal to view full details and any action items assigned to you.\n\nThank you,\nUMaT Campus Complaint Management System`;
          if (stRow.phone && stRow.phone !== 'N/A') {
            const { sendSMS } = require('../utils/sms');
            sendSMS(stRow.phone, smsMsg).catch((err) => console.error('[SMS Service Error]', err.message));
          }
          if (stRow.email) {
            const { sendEmail } = require('../utils/email');
            sendEmail({
              to: stRow.email,
              subject: `[UMaT CCM] Status Update — Ticket ${c.id} is now "${newStatus}"`,
              text: emailMsg
            }).catch((err) => console.error('[Email Service Error]', err.message));
          }
        }
      }

      // Check and send unattended complaints notification to staff
      if (req.body.assignedStaffId && req.body.assignedStaffId !== c.assigned_staff_id) {
        await checkAndAlertStaffUnattended(conn, req.body.assignedStaffId);
      }

      res.json(await assembleComplaint(pool, c.id));
    } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
  });

// =============================================================================
// DIRECTIVES (staff)
// =============================================================================
router.post('/:id/directives', verifyJWT, requireStaff, attachComplaintForStaff,
  body('text').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const c = req.complaintRow;
      await conn.query('INSERT INTO directives (complaint_id, text, completed) VALUES (?, ?, 0)', [c.id, req.body.text]);
      await addLog(conn, c.id, req.user.name, 'Directive Issued', `New action item for student: "${req.body.text}"`);
      if (c.status === 'Submitted' || c.status === 'Under Review') {
        await conn.query("UPDATE complaints SET status = 'In Progress' WHERE id = ?", [c.id]);
        await addLog(conn, c.id, req.user.name, 'Status Updated', 'Status advanced to In Progress.');
      }
      await conn.commit();
      res.status(201).json(await assembleComplaint(pool, c.id));
    } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
  });

router.put('/:id/directives/:did', verifyJWT, requireStaff, attachComplaintForStaff,
  body('completed').isBoolean(),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const c = req.complaintRow;
      const completed = req.body.completed ? 1 : 0;
      const [result] = await conn.query('UPDATE directives SET completed = ? WHERE id = ? AND complaint_id = ?',
        [completed, req.params.did, c.id]);
      if (result.affectedRows === 0) { await conn.rollback(); return res.status(404).json({ error: 'Directive not found' }); }
      await addLog(conn, c.id, req.user.name, 'Directive Updated',
        `Action item marked ${completed ? 'completed' : 'pending'}.`);
      await conn.commit();
      res.json(await assembleComplaint(pool, c.id));
    } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
  });

router.delete('/:id/directives/:did', verifyJWT, requireStaff, attachComplaintForStaff, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = req.complaintRow;
    const [result] = await conn.query('DELETE FROM directives WHERE id = ? AND complaint_id = ?', [req.params.did, c.id]);
    if (result.affectedRows === 0) { await conn.rollback(); return res.status(404).json({ error: 'Directive not found' }); }
    await addLog(conn, c.id, req.user.name, 'Directive Removed', 'An action item was withdrawn.');
    await conn.commit();
    res.json(await assembleComplaint(pool, c.id));
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// =============================================================================
// INTERNAL NOTES (staff only, never shown to students)
// =============================================================================
router.post('/:id/notes', verifyJWT, requireStaff, attachComplaintForStaff,
  body('message').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    try {
      const c = req.complaintRow;
      await pool.query('INSERT INTO internal_notes (complaint_id, operator_name, message) VALUES (?, ?, ?)',
        [c.id, req.user.name, req.body.message]);
      res.status(201).json(await assembleComplaint(pool, c.id));
    } catch (e) { next(e); }
  });

// =============================================================================
// COMMENTS / THREAD  (student own OR staff in-scope)
// =============================================================================
router.get('/:id/comments', verifyJWT, async (req, res, next) => {
  try {
    const row = await loadRawComplaint(req.params.id);
    if (!row) return res.status(404).json({ error: 'Complaint not found' });
    if (req.user.role === 'student' ? row.student_index !== req.user.index : !staffCanAccessComplaint(req.user, row)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const [comments] = await pool.query(
      'SELECT sender_type, sender_name, message, is_admin_instruction, created_at FROM comments WHERE complaint_id = ? ORDER BY id ASC',
      [row.id],
    );
    res.json(comments);
  } catch (e) { next(e); }
});

router.post('/:id/comments', verifyJWT,
  body('message').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    try {
      const row = await loadRawComplaint(req.params.id);
      if (!row) return res.status(404).json({ error: 'Complaint not found' });
      const isStudent = req.user.role === 'student';
      if (isStudent ? row.student_index !== req.user.index : !staffCanAccessComplaint(req.user, row)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const senderType = isStudent ? 'student' : 'staff';
      const senderName = req.user.name;
      // Staff comments flagged isAdmin become student-visible instructions.
      const isAdminInstruction = !isStudent && req.body.isAdmin ? 1 : 0;
      await pool.query(
        'INSERT INTO comments (complaint_id, sender_type, sender_name, message, is_admin_instruction) VALUES (?, ?, ?, ?, ?)',
        [row.id, senderType, senderName, req.body.message, isAdminInstruction],
      );

      // SMS & Email alert to student when STAFF posts a reply/message
      if (!isStudent) {
        const [[stRow]] = await pool.query('SELECT phone, name, email FROM students WHERE index_number = ?', [row.student_index]);
        if (stRow) {
          const preview = req.body.message.length > 80 ? req.body.message.substring(0, 80) + '...' : req.body.message;
          const smsMsg = `[UMaT CCM] 💬 New message on Ticket ${row.id} from ${senderName}: "${preview}" — Log in to the student portal to reply.`;
          const emailMsg = `Dear ${stRow.name},\n\nYou have received a new message regarding your complaint from ${senderName} (UMaT Staff).\n\nTicket ID: ${row.id}\nSubject: ${row.subject}\nMessage:\n"${req.body.message}"\n\nPlease log in to the student portal to view and respond.\n\nThank you,\nUMaT Campus Complaint Management System`;
          if (stRow.phone && stRow.phone !== 'N/A') {
            const { sendSMS } = require('../utils/sms');
            sendSMS(stRow.phone, smsMsg).catch((err) => console.error('[SMS Comment Alert Error]', err.message));
          }
          if (stRow.email) {
            const { sendEmail } = require('../utils/email');
            sendEmail({
              to: stRow.email,
              subject: `[UMaT CCM] New Message on Ticket ${row.id}`,
              text: emailMsg
            }).catch((err) => console.error('[Email Comment Alert Error]', err.message));
          }
        }
      }

      const assembled = await assembleComplaint(pool, row.id);
      res.status(201).json(isStudent ? redactForStudent(assembled) : assembled);
    } catch (e) { next(e); }
  });

// =============================================================================
// APPOINTMENT (staff): schedule (POST) + complete (PUT)
// =============================================================================
router.post('/:id/appointment', verifyJWT, requireStaff, attachComplaintForStaff,
  body('type').isString().trim().notEmpty(),
  body('dateTime').isString().trim().notEmpty(),
  body('venue').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const c = req.complaintRow;
      const { type, dateTime, venue, instructions, counselorName, checklist } = req.body;
      const checklistJson = Array.isArray(checklist) ? JSON.stringify(checklist) : (checklist || null);
      await conn.query(
        `INSERT INTO appointments (complaint_id, type, date_time, venue, instructions, counselor_name, checklist, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled')
         ON DUPLICATE KEY UPDATE type=VALUES(type), date_time=VALUES(date_time), venue=VALUES(venue),
           instructions=VALUES(instructions), counselor_name=VALUES(counselor_name), checklist=VALUES(checklist),
           status='Scheduled', completed=0, completed_at=NULL, feedback=NULL`,
        [c.id, type, dateTime, venue, instructions || null, counselorName || null, checklistJson],
      );
      await addLog(conn, c.id, req.user.name, 'Appointment Scheduled',
        `A ${type} appointment was scheduled for ${dateTime} at ${venue}.`);
      if (c.status === 'Submitted' || c.status === 'Under Review') {
        await conn.query("UPDATE complaints SET status = 'In Progress' WHERE id = ?", [c.id]);
        await addLog(conn, c.id, req.user.name, 'Status Updated', 'Status advanced to In Progress.');
      }
      await conn.commit();

      // Trigger real-time SMS & Email for counselor appointment
      const [[stRow]] = await conn.query('SELECT phone, name, email FROM students WHERE index_number = ?', [c.student_index]);
      if (stRow) {
        // No form currently collects a separate counselor name, so the contact
        // defaults to the staff member who scheduled the session.
        const contactName = counselorName || req.user.name;
        const smsMsg = `UMaT Appointment: A session has been scheduled for you regarding ticket ${c.id}.\nVenue: ${venue}\nDate/Time: ${dateTime}`;
        const emailMsg = `UMaT Appointment: A session has been scheduled for you regarding ticket ${c.id}.\nVenue: ${venue}\nDate/Time: ${dateTime}\nContact: ${contactName}`;
        
        if (stRow.phone && stRow.phone !== 'N/A') {
          const { sendSMS } = require('../utils/sms');
          sendSMS(stRow.phone, smsMsg).catch((err) => console.error('[SMS Service Error]', err.message));
        }
        if (stRow.email) {
          const { sendEmail } = require('../utils/email');
          sendEmail({
            to: stRow.email,
            subject: 'New Appointment Scheduled',
            text: `${emailMsg}\nInstructions: ${instructions || 'Please attend on time.'}`
          }).catch((err) => console.error('[Email Service Error]', err.message));
        }
      }

      res.status(201).json(await assembleComplaint(pool, c.id));
    } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
  });

router.put('/:id/appointment', verifyJWT, requireStaff, attachComplaintForStaff,
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const c = req.complaintRow;
      const [[appt]] = await conn.query('SELECT id FROM appointments WHERE complaint_id = ?', [c.id]);
      if (!appt) { await conn.rollback(); return res.status(404).json({ error: 'No appointment to complete' }); }
      const feedback = req.body.feedback || null;
      await conn.query(
        "UPDATE appointments SET completed = 1, completed_at = CURRENT_TIMESTAMP, status = 'Completed', feedback = ? WHERE complaint_id = ?",
        [feedback, c.id],
      );
      await addLog(conn, c.id, req.user.name, 'Appointment Completed', 'The scheduled appointment was marked completed.');
      // Feedback is surfaced to the student as an admin instruction comment.
      if (feedback) {
        await conn.query(
          "INSERT INTO comments (complaint_id, sender_type, sender_name, message, is_admin_instruction) VALUES (?, 'staff', ?, ?, 1)",
          [c.id, req.user.name, feedback],
        );
      }
      await conn.commit();
      res.json(await assembleComplaint(pool, c.id));
    } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
  });

// =============================================================================
// REMIND / resend (student)  POST /api/complaints/:id/remind
// =============================================================================
router.post('/:id/remind', verifyJWT, requireStudent, attachComplaintForStudent, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = req.complaintRow;
    await conn.query('UPDATE complaints SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?', [c.id]);
    await addLog(conn, c.id, 'Student (Ledger)', 'Reminder Sent',
      'The student sent a reminder requesting an update on this complaint.');
    await conn.commit();
    res.json(redactForStudent(await assembleComplaint(pool, c.id)));
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// =============================================================================
// DELETE SINGLE   DELETE /api/complaints/:id
// =============================================================================
router.delete('/:id', verifyJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const isStudent = (req.user.role === 'student');
    const isSuperAdmin = (req.user.role === 'staff' && req.user.type === 'SuperAdmin');
    
    if (!isStudent && !isSuperAdmin) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    
    const [rows] = await pool.query('SELECT student_index, status FROM complaints WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }
    
    const complaint = rows[0];
    
    // If student, check ownership and status
    if (isStudent) {
      if (complaint.student_index !== req.user.index) {
        return res.status(403).json({ error: 'You are not authorized to unsend this complaint.' });
      }
      if (complaint.status !== 'Submitted') {
        return res.status(400).json({ error: 'Only pending complaints can be unsent.' });
      }
    }
    
    // Delete complaint dependencies
    await pool.query('DELETE FROM comments WHERE complaint_id = ?', [id]);
    await pool.query('DELETE FROM internal_notes WHERE complaint_id = ?', [id]);
    await pool.query('DELETE FROM directives WHERE complaint_id = ?', [id]);
    await pool.query('DELETE FROM appointments WHERE complaint_id = ?', [id]);
    await pool.query('DELETE FROM action_logs WHERE complaint_id = ?', [id]);
    await pool.query('DELETE FROM complaints WHERE id = ?', [id]);
    
    return res.json({ ok: true });
  } catch (e) { next(e); }
});

// =============================================================================
// BULK DELETE     POST /api/complaints/bulk-delete (SuperAdmin only)
// =============================================================================
router.post('/bulk-delete', verifyJWT, async (req, res, next) => {
  if (req.user.role !== 'staff' || req.user.type !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required.' });
  }
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided.' });
    }
    
    await pool.query('DELETE FROM comments WHERE complaint_id IN (?)', [ids]);
    await pool.query('DELETE FROM internal_notes WHERE complaint_id IN (?)', [ids]);
    await pool.query('DELETE FROM directives WHERE complaint_id IN (?)', [ids]);
    await pool.query('DELETE FROM appointments WHERE complaint_id IN (?)', [ids]);
    await pool.query('DELETE FROM action_logs WHERE complaint_id IN (?)', [ids]);
    await pool.query('DELETE FROM complaints WHERE id IN (?)', [ids]);
    
    return res.json({ ok: true });
  } catch (e) { next(e); }
});

// =============================================================================
// HOD / STAFF ASSIGNMENT     POST /api/complaints/:id/assign
// =============================================================================
router.post('/:id/assign', verifyJWT, requireStaff, attachComplaintForStaff, async (req, res, next) => {
  const { assignedStaffId } = req.body;
  if (!assignedStaffId) return res.status(400).json({ error: 'assignedStaffId is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = req.complaintRow;
    const [[targetStaff]] = await conn.query(
      'SELECT staff_id, name, type, portfolio FROM staff WHERE staff_id = ?',
      [assignedStaffId]
    );
    if (!targetStaff) {
      await conn.rollback();
      return res.status(404).json({ error: 'Target staff officer not found' });
    }

    await conn.query('UPDATE complaints SET assigned_staff_id = ? WHERE id = ?', [assignedStaffId, c.id]);
    await addLog(conn, c.id, req.user.name, 'Officer Assigned', `Complaint assigned to ${targetStaff.name} (${targetStaff.portfolio || targetStaff.type}).`);

    if (c.status === 'Submitted') {
      await conn.query("UPDATE complaints SET status = 'Under Review' WHERE id = ?", [c.id]);
      await addLog(conn, c.id, req.user.name, 'Status Updated', 'Status advanced to Under Review upon assignment.');
    }
    await conn.commit();
    await checkAndAlertStaffUnattended(conn, assignedStaffId);
    return res.json(await assembleComplaint(pool, c.id));
  } catch (e) {
    await conn.rollback();
    return next(e);
  } finally {
    conn.release();
  }
});

// =============================================================================
// HOD BULK ASSIGNMENT     POST /api/complaints/bulk-assign
// =============================================================================
router.post('/bulk-assign', verifyJWT, requireStaff, async (req, res, next) => {
  const { ids, assignedStaffId } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0 || !assignedStaffId) {
    return res.status(400).json({ error: 'ids array and assignedStaffId are required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[targetStaff]] = await conn.query(
      'SELECT staff_id, name, type, portfolio FROM staff WHERE staff_id = ?',
      [assignedStaffId]
    );
    if (!targetStaff) {
      await conn.rollback();
      return res.status(404).json({ error: 'Target staff officer not found' });
    }

    for (const id of ids) {
      await conn.query('UPDATE complaints SET assigned_staff_id = ? WHERE id = ?', [assignedStaffId, id]);
      await conn.query(
        "UPDATE complaints SET status = 'Under Review' WHERE id = ? AND status = 'Submitted'",
        [id]
      );
      await addLog(conn, id, req.user.name, 'Officer Assigned (Bulk)', `Complaint bulk-assigned to ${targetStaff.name} (${targetStaff.portfolio || targetStaff.type}).`);
    }

    await conn.commit();
    await checkAndAlertStaffUnattended(conn, assignedStaffId);
    return res.json({ ok: true, count: ids.length, assignedTo: targetStaff.name });
  } catch (e) {
    await conn.rollback();
    return next(e);
  } finally {
    conn.release();
  }
});

// =============================================================================
// FACULTY OFFICERS LIST     GET /api/complaints/faculty/:facultyKey/officers
// =============================================================================
router.get('/faculty/:facultyKey/officers', verifyJWT, requireStaff, async (req, res, next) => {
  try {
    const { facultyKey } = req.params;
    const [rows] = await pool.query(
      `SELECT staff_id AS staffId, name, type, portfolio, department_label AS departmentLabel, email
         FROM staff
        WHERE type = 'Counsellor' OR (type = 'Finance' AND (faculty_key = ? OR faculty_key IS NULL))
        ORDER BY FIELD(type, 'Counsellor', 'Finance'), name ASC`,
      [facultyKey]
    );
    return res.json(rows);
  } catch (e) { next(e); }
});

// =============================================================================
// DEAN SUMMARY STATS     GET /api/complaints/dean-summary
// =============================================================================
router.get('/dean-summary', verifyJWT, requireStaff, async (req, res, next) => {
  try {
    if (req.user.type !== 'Dean' && req.user.type !== 'Vice Dean' && req.user.type !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Dean access required' });
    }
    const facultyKey = req.user.facultyKey;

    const [[totalRow]] = await pool.query(
      'SELECT COUNT(*) AS total FROM complaints WHERE faculty_key = ?',
      [facultyKey]
    );
    const [statusRows] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM complaints WHERE faculty_key = ? GROUP BY status',
      [facultyKey]
    );
    const [categoryRows] = await pool.query(
      `SELECT cat.name AS category, COUNT(*) AS count
         FROM complaints c
         JOIN categories cat ON cat.id = c.category_id
        WHERE c.faculty_key = ?
        GROUP BY cat.name`,
      [facultyKey]
    );

    const statusCounts = { Submitted: 0, 'Under Review': 0, 'In Progress': 0, Resolved: 0, Rejected: 0 };
    statusRows.forEach(r => { statusCounts[r.status] = r.count; });

    return res.json({
      facultyKey,
      total: totalRow ? totalRow.total : 0,
      statusCounts,
      categoryCounts: categoryRows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
