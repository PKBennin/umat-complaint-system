// Seeds reference + demo data into MySQL from the repo's seedData.js
// (single source of truth). Idempotent: clears rows in dependency order, then
// inserts. All demo accounts get bcrypt-hashed password "password123".
require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

// seedData.js references `localStorage` at module load (browser guard). Shim it
// so we can require the file unchanged in Node and keep one source of truth.
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  clear() { this._s = {}; },
};

const {
  FACULTIES, DEPARTMENTS, PROGRAMMES, CATEGORIES, STUDENT_DATABASE, STAFF_DATABASE,
} = require(path.join('..', 'seedData.js'));

const DEFAULT_PASSWORD = 'password123';

(async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Clear in dependency order (children first) so seeding is re-runnable.
    for (const t of [
      'action_logs', 'comments', 'internal_notes', 'directives', 'appointments',
      'complaints', 'students', 'staff', 'programmes', 'departments', 'categories', 'faculties',
    ]) {
      await conn.query(`DELETE FROM ${t}`);
    }

    // Faculties
    for (const [key, name] of Object.entries(FACULTIES)) {
      await conn.query('INSERT INTO faculties (faculty_key, name) VALUES (?, ?)', [key, name]);
    }

    // Departments -> capture name->id
    const deptId = {};
    for (const name of DEPARTMENTS) {
      const [res] = await conn.query('INSERT INTO departments (name) VALUES (?)', [name]);
      deptId[name] = res.insertId;
    }

    // Programmes
    for (const p of PROGRAMMES) {
      await conn.query(
        'INSERT INTO programmes (name, department_id, faculty_key) VALUES (?, ?, ?)',
        [p.name, deptId[p.department] ?? null, p.facultyKey],
      );
    }

    // Categories
    for (const c of CATEGORIES) {
      await conn.query(
        'INSERT INTO categories (id, name, route_type) VALUES (?, ?, ?)',
        [c.id, c.name, c.routeType],
      );
    }

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Staff
    for (const s of STAFF_DATABASE) {
      // department may be a real department name or a free-text office label.
      const realDeptId = deptId[s.department] ?? null;
      await conn.query(
        `INSERT INTO staff
           (staff_id, name, email, password_hash, type, faculty_key, department_id, department_label, portfolio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.staffId, s.name, s.email, hash, s.type, s.facultyKey || null, realDeptId, s.department, s.portfolio],
      );
    }

    // Students (no programme in seed data -> programme_id NULL)
    for (const st of STUDENT_DATABASE) {
      await conn.query(
        `INSERT INTO students (index_number, name, email, phone, password_hash, level, programme_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [st.index, st.name, st.email, st.phone, hash, st.level, null],
      );
    }

    await conn.commit();
    console.log('✓ Seed complete');
    console.log(`  faculties=${Object.keys(FACULTIES).length} departments=${DEPARTMENTS.length} ` +
      `programmes=${PROGRAMMES.length} categories=${CATEGORIES.length} ` +
      `staff=${STAFF_DATABASE.length} students=${STUDENT_DATABASE.length}`);
    console.log(`  demo password for every account: "${DEFAULT_PASSWORD}"`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((err) => {
  console.error('✗ Seed failed:', err.message);
  process.exit(1);
});
