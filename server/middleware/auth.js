// JWT verification + role-based access helpers (PDF §5).
require('dotenv').config();
const jwt = require('jsonwebtoken');

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

function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access required' });
  }
  return next();
}

function requireStaff(req, res, next) {
  if (!req.user || req.user.role !== 'staff') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  return next();
}

// Builds a SQL WHERE fragment (+ params) limiting complaints to a staff
// member's jurisdiction, mirroring admin.js:renderWorkstationSidebar.
//   Dean    -> own faculty AND routing_dept = own office label
//   Finance -> own faculty AND routing_dept = 'finance_dept'
//   IT      -> routing_dept = 'ict_dept' (university-wide)
//   HOD     -> own department (analytics scope)
function staffScopeClause(user) {
  switch (user.type) {
    case 'Dean':
      return { clause: 'c.faculty_key = ? AND c.routing_dept = ?', params: [user.facultyKey, user.departmentLabel] };
    case 'Finance':
      return { clause: "c.faculty_key = ? AND c.routing_dept = 'finance_dept'", params: [user.facultyKey] };
    case 'IT':
      return { clause: "c.routing_dept = 'ict_dept'", params: [] };
    case 'HOD':
      // HODs see their department's tickets (analytics only in the UI).
      return { clause: 'c.faculty_key = ?', params: [user.facultyKey] };
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
    case 'Dean':
      return c.faculty_key === user.facultyKey && c.routing_dept === user.departmentLabel;
    case 'Finance':
      return c.faculty_key === user.facultyKey && c.routing_dept === 'finance_dept';
    case 'IT':
      return c.routing_dept === 'ict_dept';
    case 'HOD':
      return c.faculty_key === user.facultyKey;
    case 'SuperAdmin':
      return true;
    default:
      return false;
  }
}

module.exports = {
  signToken, verifyJWT, requireStudent, requireStaff, staffScopeClause, staffCanAccessComplaint,
};
