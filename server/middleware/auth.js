// JWT verification + role-based access helpers (PDF §5).
require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../db');

const SECRET = process.env.JWT_SECRET || 'umat-dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

// Populates req.user = { role: 'student'|'staff', ...claims }
function verifyJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    req.user = jwt.verify(token, SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access required' });
  }
  try {
    const [[student]] = await pool.query('SELECT index_number FROM students WHERE index_number = ?', [req.user.index]);
    if (!student) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

function requireStaff(req, res, next) {
  if (!req.user || req.user.role !== 'staff') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  return next();
}

// Builds a SQL WHERE fragment (+ params) limiting complaints to a staff
// member's jurisdiction.
//
// New routing model:
//   HOD           -> sees all complaints routed to them (hod_staff_id = ?)
//   Dean          -> sees ALL complaints in their faculty (monitoring)
//                    + harassment complaints assigned to them (full action)
//   Finance       -> sees only complaints explicitly assigned to them
//   IT            -> routing_dept = 'ict_dept' (university-wide, direct route)
//   Faculty/Dept Officer -> sees only complaints explicitly assigned to them
//   SuperAdmin    -> sees everything
function staffScopeClause(user) {
  switch (user.type) {
    case 'HOD':
    case 'Department Officer':
      // HOD sees all complaints routed to them as hod_staff_id.
      // Also sees any complaint directly assigned to them.
      return {
        clause: '(c.hod_staff_id = ? OR c.assigned_staff_id = ?)',
        params: [user.staffId, user.staffId],
      };
    case 'Dean':
    case 'Vice Dean':
      // Dean sees ALL complaints in their faculty (for monitoring)
      // This includes harassment (where they are assigned) + all HOD-routed ones.
      return {
        clause: 'c.faculty_key = ?',
        params: [user.facultyKey],
      };
    case 'Finance':
    case 'Faculty Officer':
      // These officers only see complaints the HOD explicitly assigned to them.
      return {
        clause: 'c.assigned_staff_id = ?',
        params: [user.staffId],
      };
    case 'IT':
      // IT sees all ICT complaints (direct route, unchanged).
      return { clause: "c.routing_dept = 'ict_dept'", params: [] };
    case 'SuperAdmin':
      return { clause: '1 = 1', params: [] };
    default:
      return { clause: '1 = 0', params: [] };
  }
}

// True if this staff member is allowed to act on a specific complaint row.
function staffCanAccessComplaint(user, complaintRow) {
  const c = complaintRow;
  switch (user.type) {
    case 'HOD':
    case 'Department Officer':
      return c.hod_staff_id === user.staffId || c.assigned_staff_id === user.staffId;
    case 'Dean':
    case 'Vice Dean':
      return c.faculty_key === user.facultyKey;
    case 'Finance':
    case 'Faculty Officer':
      return c.assigned_staff_id === user.staffId;
    case 'IT':
      return c.routing_dept === 'ict_dept';
    case 'SuperAdmin':
      return true;
    default:
      return false;
  }
}

module.exports = {
  signToken, verifyJWT, requireStudent, requireStaff, staffScopeClause, staffCanAccessComplaint,
};
