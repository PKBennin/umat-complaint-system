// Authentication routes: student + staff login, student registration, profile completion.
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

// POST /api/auth/student/signup (Only email and password required!)
router.post('/student/signup',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 4, max: 8 }),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    try {
      const { email, password } = req.body;
      
      // Enforce student domain limit on student email: e.g. student@st.umat.edu.gh
      const isUmatEmail = email.trim().toLowerCase().endsWith('@st.umat.edu.gh');
      if (!isUmatEmail) {
        return res.status(400).json({ error: 'Only student email addresses ending with @st.umat.edu.gh are allowed.' });
      }

      // Check duplicates
      const [[existing]] = await pool.query('SELECT index_number FROM students WHERE email = ?', [email]);
      if (existing) {
        return res.status(400).json({ error: 'Email address already registered' });
      }

      // Generate a temporary unique index number (e.g. TMP + 10 random digits)
      const tempIndex = 'TMP' + Math.floor(1000000000 + Math.random() * 9000000000);

      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO students (index_number, name, email, phone, password_hash, level, programme_id, reference_number, is_profile_complete)
         VALUES (?, NULL, ?, NULL, ?, NULL, NULL, NULL, 0)`,
        [tempIndex, email, hash]
      );

      const token = signToken({ role: 'student', index: tempIndex, name: 'Student' });
      return res.json({
        token,
        student: {
          index_number: tempIndex,
          index: tempIndex,
          name: '',
          email,
          phone: '',
          level: null,
          programme: null,
          reference_number: null,
          is_profile_complete: false
        }
      });
    } catch (e) { return next(e); }
  });

// POST /api/auth/student/login
router.post('/student/login',
  body('index_number').isString().trim().notEmpty(), // Holds either index number or email
  body('password').isString().notEmpty(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    try {
      const { index_number, password } = req.body;
      const [[student]] = await pool.query(
        `SELECT s.index_number, s.name, s.email, s.phone, s.level, s.password_hash, s.reference_number, s.is_profile_complete,
                p.name AS programme
           FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
          WHERE s.index_number = ? OR s.email = ?`,
        [index_number, index_number],
      );
      if (!student || !(await bcrypt.compare(password, student.password_hash))) {
        return res.status(401).json({ error: 'Invalid credentials or password' });
      }
      const token = signToken({ role: 'student', index: student.index_number, name: student.name || 'Student' });
      return res.json({
        token,
        student: {
          index_number: student.index_number,
          index: student.index_number,
          name: student.name || '',
          email: student.email,
          phone: student.phone || '',
          level: student.level,
          programme: student.programme || null,
          reference_number: student.reference_number || null,
          is_profile_complete: !!student.is_profile_complete,
        },
      });
    } catch (e) { return next(e); }
  });

// POST /api/auth/student/complete-profile
router.post('/student/complete-profile', verifyJWT,
  body('name').isString().trim().notEmpty(),
  body('index_number').isString().trim().matches(/^[0-9]{10}$/).withMessage('Index number must be exactly 10 digits'),
  body('phone').isString().trim().notEmpty(),
  body('level').isString().trim().notEmpty(),
  body('programme_id').isInt(),
  body('reference_number').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
    try {
      const { name, index_number, phone, level, programme_id, reference_number } = req.body;
      
      // Verify programme exists
      const [[prog]] = await pool.query('SELECT id, name FROM programmes WHERE id = ?', [programme_id]);
      if (!prog) {
        return res.status(400).json({ error: 'Invalid course/programme selected.' });
      }

      // Check if actual index number is already registered by another student
      const [[existingIndex]] = await pool.query(
        'SELECT index_number FROM students WHERE index_number = ? AND index_number != ?',
        [index_number, req.user.index]
      );
      if (existingIndex) {
        return res.status(400).json({ error: 'This student index number is already registered by another account.' });
      }

      // Update student profile, including primary key index_number
      const [result] = await pool.query(
        `UPDATE students 
            SET index_number = ?, name = ?, phone = ?, level = ?, programme_id = ?, reference_number = ?, is_profile_complete = 1 
          WHERE index_number = ?`,
        [index_number, name, phone, level, programme_id, reference_number, req.user.index]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      // Re-sign JWT Token with the updated index number
      const newToken = signToken({ role: 'student', index: index_number, name });

      // Return updated profile details and new token
      const [[student]] = await pool.query(
        `SELECT s.index_number, s.name, s.email, s.phone, s.level, s.reference_number, s.is_profile_complete,
                p.name AS programme
           FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
          WHERE s.index_number = ?`,
        [index_number]
      );

      return res.json({
        ok: true,
        token: newToken,
        student: {
          index_number: student.index_number,
          index: student.index_number,
          name: student.name,
          email: student.email,
          phone: student.phone,
          level: student.level,
          programme: student.programme || null,
          reference_number: student.reference_number || null,
          is_profile_complete: !!student.is_profile_complete
        }
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
           FROM staff WHERE staff_id = ? OR email = ?`,
        [staff_id, staff_id],
      );
      if (!staff || !(await bcrypt.compare(req.body.password, staff.password_hash))) {
        return res.status(401).json({ error: 'Invalid credentials. Check your ID/Email and password.' });
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
  body('newPassword').isString().isLength({ min: 4, max: 8 }),
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

// PUT /api/auth/staff/profile  { email }
router.put('/staff/profile', verifyJWT,
  body('email').isEmail().normalizeEmail(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'staff') return res.status(403).json({ error: 'Staff access required' });
    try {
      const { email } = req.body;
      const [[existing]] = await pool.query('SELECT staff_id FROM staff WHERE email = ? AND staff_id != ?', [email, req.user.staffId]);
      if (existing) {
        return res.status(400).json({ error: 'This email address is already in use by another officer.' });
      }
      await pool.query('UPDATE staff SET email = ? WHERE staff_id = ?', [email, req.user.staffId]);
      return res.json({ ok: true });
    } catch (e) { return next(e); }
  });

// PUT /api/auth/student/profile  { phone, email }
router.put('/student/profile', verifyJWT,
  body('phone').isString().trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
    try {
      const { phone, email } = req.body;
      const [result] = await pool.query(
        'UPDATE students SET phone = ?, email = ? WHERE index_number = ?',
        [phone, email, req.user.index],
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Student not found' });
      
      // Load updated student details to return
      const [[student]] = await pool.query(
        `SELECT s.index_number, s.name, s.email, s.phone, s.level, s.reference_number, s.is_profile_complete,
                p.name AS programme
           FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
          WHERE s.index_number = ?`,
        [req.user.index],
      );

      return res.json({
        ok: true,
        student: {
          index_number: student.index_number,
          index: student.index_number,
          name: student.name,
          email: student.email,
          phone: student.phone,
          level: student.level,
          programme: student.programme || null,
          reference_number: student.reference_number || null,
          is_profile_complete: !!student.is_profile_complete,
        }
      });
    } catch (e) { return next(e); }
  });

// GET /api/auth/staff (Get all staff members - SuperAdmin only)
router.get('/staff', verifyJWT, async (req, res, next) => {
  if (req.user.role !== 'staff' || req.user.type !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT staff_id, name, email, type, faculty_key, department_label, portfolio 
         FROM staff ORDER BY name`
    );
    return res.json(rows);
  } catch (e) { return next(e); }
});

// POST /api/auth/staff (Create a staff member - SuperAdmin only)
router.post('/staff', verifyJWT,
  body('staff_id').isString().trim().notEmpty(),
  body('name').isString().trim().notEmpty(),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 4, max: 8 }),
  body('type').isIn(['Dean', 'Finance', 'IT', 'HOD', 'SuperAdmin']),
  body('portfolio').isString().trim().notEmpty(),
  async (req, res, next) => {
    if (badRequest(req, res)) return;
    if (req.user.role !== 'staff' || req.user.type !== 'SuperAdmin') {
      return res.status(403).json({ error: 'SuperAdmin access required' });
    }
    try {
      const { staff_id, name, email, password, type, faculty_key, department_label, portfolio } = req.body;

      // Check duplicates
      const [[existingId]] = await pool.query('SELECT staff_id FROM staff WHERE staff_id = ?', [staff_id]);
      if (existingId) {
        return res.status(400).json({ error: 'Staff ID already registered' });
      }

      if (email) {
        const [[existingEmail]] = await pool.query('SELECT email FROM staff WHERE email = ?', [email]);
        if (existingEmail) {
          return res.status(400).json({ error: 'Email address already registered' });
        }
      }

      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO staff (staff_id, name, email, password_hash, type, faculty_key, department_id, department_label, portfolio)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [staff_id, name, email || null, hash, type, faculty_key || null, department_label || null, portfolio]
      );

      return res.json({ ok: true });
    } catch (e) { return next(e); }
  });

// DELETE /api/auth/staff (Delete all staff members except current SuperAdmin)
router.delete('/staff', verifyJWT, async (req, res, next) => {
  if (req.user.role !== 'staff' || req.user.type !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required' });
  }
  try {
    const callerId = req.user.staffId;
    await pool.query('UPDATE complaints SET assigned_staff_id = NULL WHERE assigned_staff_id != ?', [callerId]);
    await pool.query('DELETE FROM staff WHERE staff_id != ?', [callerId]);
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

// DELETE /api/auth/staff/:id (Delete a staff member - SuperAdmin only)
router.delete('/staff/:id', verifyJWT, async (req, res, next) => {
  if (req.user.role !== 'staff' || req.user.type !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required' });
  }
  try {
    const staffId = req.params.id;
    if (staffId === req.user.staffId) {
      return res.status(400).json({ error: 'You cannot remove your own administrator account.' });
    }
    await pool.query('UPDATE complaints SET assigned_staff_id = NULL WHERE assigned_staff_id = ?', [staffId]);
    const [result] = await pool.query('DELETE FROM staff WHERE staff_id = ?', [staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

module.exports = router;
