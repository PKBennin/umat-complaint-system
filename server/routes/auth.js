// Authentication routes: student + staff login (PDF §4.1), plus password change.
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { signToken, verifyJWT } = require('../middleware/auth');

const router = express.Router();

function badRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return true;
  }
  return false;
}

// POST /api/auth/student/login
router.post('/student/login',
  body('index_number').isString().trim().notEmpty(),
  body('password').isString().notEmpty(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    try {
      const { index_number, password } = req.body;
      const [[student]] = await pool.query(
        `SELECT s.index_number, s.name, s.email, s.phone, s.level, s.password_hash,
                p.name AS programme
           FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
          WHERE s.index_number = ?`,
        [index_number],
      );
      if (!student || !(await bcrypt.compare(password, student.password_hash))) {
        return res.status(401).json({ error: 'Invalid index number or password' });
      }
      const token = signToken({ role: 'student', index: student.index_number, name: student.name });
      return res.json({
        token,
        student: {
          index_number: student.index_number,
          index: student.index_number,
          name: student.name,
          email: student.email,
          phone: student.phone,
          level: student.level,
          programme: student.programme || null,
        },
      });
    } catch (e) { return next(e); }
  });

// POST /api/auth/staff/login
router.post('/staff/login',
  body('staff_id').isString().trim().notEmpty(),
  body('password').isString().notEmpty(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    try {
      const { staff_id } = req.body;
      const [[staff]] = await pool.query(
        `SELECT staff_id, name, email, password_hash, type, faculty_key, department_label, portfolio
           FROM staff WHERE staff_id = ?`,
        [staff_id],
      );
      if (!staff || !(await bcrypt.compare(req.body.password, staff.password_hash))) {
        return res.status(401).json({ error: 'Invalid staff ID or password' });
      }
      const token = signToken({
        role: 'staff',
        staffId: staff.staff_id,
        name: staff.name,
        type: staff.type,
        facultyKey: staff.faculty_key,
        departmentLabel: staff.department_label,
      });
      return res.json({
        token,
        staff: {
          staffId: staff.staff_id,
          staff_id: staff.staff_id,
          name: staff.name,
          email: staff.email,
          type: staff.type,
          facultyKey: staff.faculty_key,
          department: staff.department_label,
          portfolio: staff.portfolio,
        },
      });
    } catch (e) { return next(e); }
  });

// PUT /api/auth/student/password  { currentPassword, newPassword }
router.put('/student/password', verifyJWT,
  body('newPassword').isString().isLength({ min: 4 }),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
    try {
      const [[student]] = await pool.query('SELECT password_hash FROM students WHERE index_number = ?', [req.user.index]);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (req.body.currentPassword && !(await bcrypt.compare(req.body.currentPassword, student.password_hash))) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      const hash = await bcrypt.hash(req.body.newPassword, 10);
      await pool.query('UPDATE students SET password_hash = ? WHERE index_number = ?', [hash, req.user.index]);
      return res.json({ ok: true });
    } catch (e) { return next(e); }
  });

// PUT /api/auth/staff/password  { currentPassword, newPassword }
router.put('/staff/password', verifyJWT,
  body('newPassword').isString().isLength({ min: 4 }),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'staff') return res.status(403).json({ error: 'Staff access required' });
    try {
      const [[staff]] = await pool.query('SELECT password_hash FROM staff WHERE staff_id = ?', [req.user.staffId]);
      if (!staff) return res.status(404).json({ error: 'Staff not found' });
      if (req.body.currentPassword && !(await bcrypt.compare(req.body.currentPassword, staff.password_hash))) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      const hash = await bcrypt.hash(req.body.newPassword, 10);
      await pool.query('UPDATE staff SET password_hash = ? WHERE staff_id = ?', [hash, req.user.staffId]);
      return res.json({ ok: true });
    } catch (e) { return next(e); }
  });

module.exports = router;
