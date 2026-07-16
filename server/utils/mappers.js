// Assembles the exact complaint object shape the frontend already expects
// (camelCase, with embedded timeline/comments/internalNotes/directives/appointment),
// so app.js / admin.js render code does not need to change.

// Fetch one fully-assembled complaint (or null) by id.
async function assembleComplaint(conn, id) {
  const [[row]] = await conn.query(
    `SELECT c.*,
            s.name  AS student_name, s.email AS student_email, s.phone AS student_phone, s.level AS student_level, s.reference_number AS student_ref,
            cat.name AS category_name,
            fac.name AS faculty_name,
            prog.name AS programme_name,
            dept.name AS dept_name,
            ast.name AS assigned_name
       FROM complaints c
       JOIN students s      ON s.index_number = c.student_index
       JOIN categories cat  ON cat.id = c.category_id
       LEFT JOIN faculties fac  ON fac.faculty_key = c.faculty_key
       LEFT JOIN programmes prog ON prog.id = c.programme_id
       LEFT JOIN departments dept ON dept.id = prog.department_id
       LEFT JOIN staff ast  ON ast.staff_id = c.assigned_staff_id
      WHERE c.id = ?`,
    [id],
  );
  if (!row) return null;
  return assembleFromRow(conn, row);
}

// Assemble many complaints from an already-selected list of rows (same columns
// as assembleComplaint's SELECT). Used by list endpoints.
async function assembleMany(conn, rows) {
  const out = [];
  for (const row of rows) out.push(await assembleFromRow(conn, row));
  return out;
}

const LIST_SELECT = `
  SELECT c.*,
         s.name  AS student_name, s.email AS student_email, s.phone AS student_phone, s.level AS student_level, s.reference_number AS student_ref,
         cat.name AS category_name,
         fac.name AS faculty_name,
         prog.name AS programme_name,
         dept.name AS dept_name,
         ast.name AS assigned_name
    FROM complaints c
    JOIN students s      ON s.index_number = c.student_index
    JOIN categories cat  ON cat.id = c.category_id
    LEFT JOIN faculties fac  ON fac.faculty_key = c.faculty_key
    LEFT JOIN programmes prog ON prog.id = c.programme_id
    LEFT JOIN departments dept ON dept.id = prog.department_id
    LEFT JOIN staff ast  ON ast.staff_id = c.assigned_staff_id`;

async function assembleFromRow(conn, row) {
  const id = row.id;

  const [logs] = await conn.query(
    'SELECT operator_name, action_type, details, created_at FROM action_logs WHERE complaint_id = ? ORDER BY id ASC',
    [id],
  );
  const [comments] = await conn.query(
    'SELECT sender_type, sender_name, message, is_admin_instruction, created_at FROM comments WHERE complaint_id = ? ORDER BY id ASC',
    [id],
  );
  const [notes] = await conn.query(
    'SELECT operator_name, message, created_at FROM internal_notes WHERE complaint_id = ? ORDER BY id ASC',
    [id],
  );
  const [directives] = await conn.query(
    'SELECT id, text, completed FROM directives WHERE complaint_id = ? ORDER BY id ASC',
    [id],
  );
  const [[appt]] = await conn.query(
    'SELECT type, date_time, venue, instructions, counselor_name, checklist, status, completed, completed_at, feedback FROM appointments WHERE complaint_id = ?',
    [id],
  );

  const isAnon = row.student_index === '9099999999';
  return {
    id: row.id,
    studentName: isAnon ? 'Anonymous Student' : row.student_name,
    studentIndex: isAnon ? '9099999999' : row.student_index,
    studentRef: isAnon ? 'N/A' : (row.student_ref || 'N/A'),
    studentProgramme: isAnon ? 'N/A' : (row.programme_name || 'N/A'),
    studentDept: isAnon ? 'N/A' : (row.dept_name || 'N/A'),
    // faculty_key/faculty_name describe the complaint's routing destination, not the
    // filer's identity, so they stay populated even when the submission is anonymous.
    studentFaculty: row.faculty_name || 'N/A',
    studentFacultyKey: row.faculty_key || '',
    studentLevel: isAnon ? 'N/A' : (row.student_level || 'N/A'),
    studentEmail: isAnon ? 'N/A' : (row.student_email || 'N/A'),
    studentPhone: isAnon ? 'N/A' : (row.student_phone || 'N/A'),
    category: row.category_name,
    subject: row.subject,
    description: row.description,
    urgency: row.urgency,
    routingDept: row.routing_dept || '',
    assignedTo: row.assigned_name || 'Unassigned',
    assignedStaffId: row.assigned_staff_id || null,
    status: row.status,
    attachment: row.attachment_stored_name ? {
      originalName: row.attachment_original_name,
      mimetype: row.attachment_mimetype,
      size: row.attachment_size,
      downloadUrl: `/api/complaints/${row.id}/attachment`,
    } : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastRemindedAt: toIso(row.last_reminded_at),
    timeline: logs.map((l) => ({
      date: toIso(l.created_at),
      action: l.action_type,
      message: l.details,
      by: l.operator_name,
    })),
    comments: comments.map((c) => ({
      date: toIso(c.created_at),
      by: c.sender_name,
      message: c.message,
      isAdmin: !!c.is_admin_instruction,
      senderType: c.sender_type,
    })),
    internalNotes: notes.map((n) => ({
      date: toIso(n.created_at),
      by: n.operator_name,
      message: n.message,
    })),
    directives: directives.map((d) => ({
      id: d.id,
      text: d.text,
      completed: !!d.completed,
    })),
    appointment: appt ? {
      type: appt.type,
      dateTime: appt.date_time,
      venue: appt.venue,
      instructions: appt.instructions,
      counselorName: appt.counselor_name,
      checklist: parseChecklist(appt.checklist),
      status: appt.status,
      completed: !!appt.completed,
      completedAt: toIso(appt.completed_at),
      feedback: appt.feedback,
    } : null,
  };
}

// TIMESTAMP columns come back as 'YYYY-MM-DD HH:MM:SS' strings (dateStrings:true).
// Frontend expects ISO8601; convert while treating the DB value as UTC.
function toIso(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    const d = new Date(v.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? v : d.toISOString();
  }
  return new Date(v).toISOString();
}

function parseChecklist(v) {
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Strip staff-only data before sending a complaint to a student. Internal notes
// must never leave the server for a student viewer (they are confidential), and
// non-instruction staff chatter is kept as thread comments only.
function redactForStudent(complaint) {
  if (!complaint) return complaint;
  return { ...complaint, internalNotes: [] };
}

module.exports = { assembleComplaint, assembleMany, assembleFromRow, LIST_SELECT, toIso, redactForStudent };
