// Reference data (faculties, departments, programmes, categories). Optional —
// the frontend form dropdowns can still use seedData.js, but this lets the
// backend serve the same reference data if desired.
const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [faculties] = await pool.query('SELECT faculty_key, name FROM faculties ORDER BY faculty_key');
    const [departments] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    const [programmes] = await pool.query(
      `SELECT p.id, p.name, p.faculty_key AS facultyKey, d.name AS department
         FROM programmes p JOIN departments d ON d.id = p.department_id ORDER BY p.name`,
    );
    const [categories] = await pool.query('SELECT id, name, route_type AS routeType FROM categories');
    res.json({ faculties, departments, programmes, categories });
  } catch (e) { next(e); }
});

module.exports = router;
