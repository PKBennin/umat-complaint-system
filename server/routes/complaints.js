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
      console.log('[API POST /api/complaints] Parsed Body:', { studentName, studentIndex, subject, category, urgency, description, programmeName });
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
           (id, student_index, subject, category_id, urgency, description, status,
            assigned_staff_id, programme_id, routing_dept, faculty_key,
            attachment_stored_name, attachment_original_name, attachment_mimetype, attachment_size)
         VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, studentIndex, subject, routing.categoryId, urgency, description,
          routing.assignedStaffId, routing.programmeId, routing.routingDept, routing.facultyKey,
          file ? file.filename : null, file ? file.originalname : null,
          file ? file.mimetype : null, file ? file.size : null],
      );
      await addLog(conn, id, 'System Engine', 'Complaint Submitted',
        `Complaint successfully registered under Ticket ID ${id} and routed to the ${routing.role}.`);
      await conn.commit();

      // Trigger real-time SMS & Email to student
      const [[stRow]] = await conn.query('SELECT phone, name, email FROM students WHERE index_number = ?', [studentIndex]);
      if (stRow) {
        const msg = `Your complaint on "${subject}" has been submitted successfully.`;
        if (stRow.phone && stRow.phone !== 'N/A') {
          const { sendSMS } = require('../utils/sms');
          sendSMS(stRow.phone, msg).catch((err) => console.error('[SMS Service Error]', err.message));
        }
        if (stRow.email) {
          const { sendEmail } = require('../utils/email');
          sendEmail({
            to: stRow.email,
            subject: 'Complaint Submitted Successfully',
            text: `${msg} Ticket ID: ${id}. You can track progress on the student portal.`
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
        await conn.query('UPDATE complaints SET assigned_staff_id = ? WHERE id = ?', [req.body.assignedStaffId, c.id]);
        await addLog(conn, c.id, operator, 'Officer Assigned', 'Ticket ownership reassigned.');
      }
      await conn.commit();

      // Trigger real-time SMS & Email on status update
      if (req.body.status && req.body.status !== c.status) {
        const [[stRow]] = await conn.query('SELECT phone, name, email FROM students WHERE index_number = ?', [c.student_index]);
        if (stRow) {
          const msg = `Your complaint (${c.id}) IS ${req.body.status.toUpperCase()}.`;
          if (stRow.phone && stRow.phone !== 'N/A') {
            const { sendSMS } = require('../utils/sms');
            sendSMS(stRow.phone, msg).catch((err) => console.error('[SMS Service Error]', err.message));
          }
          if (stRow.email) {
            const { sendEmail } = require('../utils/email');
            sendEmail({
              to: stRow.email,
              subject: 'Grievance Status Updated',
              text: `${msg} You can check detailed updates on the student portal.`
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
        const smsMsg = `UMaT Appointment: A session has been scheduled for you regarding ticket ${c.id}.\nVenue: ${venue}\nDate/Time: ${dateTime}`;
        const emailMsg = `UMaT Appointment: A session has been scheduled for you regarding ticket ${c.id}.\nVenue: ${venue}\nDate/Time: ${dateTime}\nAdvisor: ${counselorName || 'Counselor'}`;
        
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

module.exports = router;
