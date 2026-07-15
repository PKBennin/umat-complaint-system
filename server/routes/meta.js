// Reference data (faculties, departments, programmes, categories). Optional —
// the frontend form dropdowns can still use seedData.js, but this lets the
// backend serve the same reference data if desired.
const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [faculties] = await pool.query('SELECT faculty_key, name FROM faculties ORDER BY faculty_key');
    const [departments] = await pool.query('SELECT id, name, faculty_key FROM departments ORDER BY name');
    const [programmes] = await pool.query(
      `SELECT p.id, p.name, p.faculty_key AS facultyKey, d.name AS department
         FROM programmes p JOIN departments d ON d.id = p.department_id ORDER BY p.name`,
    );
    const [categories] = await pool.query('SELECT id, name, route_type AS routeType FROM categories');
    res.json({ faculties, departments, programmes, categories });
  } catch (e) { next(e); }
});

// GET /api/meta/admin-dashboard (SuperAdmin Workspace metrics & recent activities)
router.get('/admin-dashboard', async (req, res, next) => {
  try {
    const [[totalComplaints]] = await pool.query('SELECT COUNT(*) AS count FROM complaints');
    const [[openComplaints]] = await pool.query("SELECT COUNT(*) AS count FROM complaints WHERE status IN ('Submitted', 'Under Review', 'In Progress')");
    const [[resolvedComplaints]] = await pool.query("SELECT COUNT(*) AS count FROM complaints WHERE status = 'Resolved'");
    const [[activeStaff]] = await pool.query('SELECT COUNT(*) AS count FROM staff');

    const [recentComplaints] = await pool.query(
      `SELECT c.id, c.subject, c.status, c.created_at, cat.name AS category_name
         FROM complaints c
         LEFT JOIN categories cat ON cat.id = c.category_id
        ORDER BY c.created_at DESC LIMIT 6`
    );

    const [faculties] = await pool.query(
      `SELECT f.faculty_key, f.name, COUNT(s.staff_id) AS staff_count
         FROM faculties f
         LEFT JOIN staff s ON s.faculty_key = f.faculty_key
        GROUP BY f.faculty_key, f.name
        ORDER BY f.name`
    );

    const [departments] = await pool.query(
      `SELECT d.id, d.name, d.faculty_key, COUNT(s.staff_id) AS staff_count
         FROM departments d
         LEFT JOIN staff s ON s.department_id = d.id
        GROUP BY d.id, d.name, d.faculty_key
        ORDER BY d.name`
    );

    res.json({
      stats: {
        totalComplaints: totalComplaints.count,
        openComplaints: openComplaints.count,
        resolvedComplaints: resolvedComplaints.count,
        activeStaff: activeStaff.count
      },
      recentComplaints,
      faculties,
      departments
    });
  } catch (e) { next(e); }
});

// POST /api/meta/departments (SuperAdmin adds new department under a faculty)
router.post('/departments', async (req, res, next) => {
  try {
    const { name, faculty_key } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }
    if (!faculty_key || !faculty_key.trim()) {
      return res.status(400).json({ error: 'Faculty assignment is required' });
    }
    const [result] = await pool.query('INSERT INTO departments (name, faculty_key) VALUES (?, ?)', [name.trim(), faculty_key.trim()]);
    res.json({ ok: true, id: result.insertId, name: name.trim(), faculty_key: faculty_key.trim() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Department already exists' });
    }
    next(e);
  }
});

// POST /api/meta/faculties (SuperAdmin adds new faculty)
router.post('/faculties', async (req, res, next) => {
  try {
    const { faculty_key, name } = req.body;
    if (!faculty_key || !faculty_key.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: 'Faculty key and name are required' });
    }
    await pool.query('INSERT INTO faculties (faculty_key, name) VALUES (?, ?)', [faculty_key.trim().toUpperCase(), name.trim()]);
    res.json({ ok: true, faculty_key: faculty_key.trim().toUpperCase(), name: name.trim() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Faculty already exists' });
    }
    next(e);
  }
});

module.exports = router;
