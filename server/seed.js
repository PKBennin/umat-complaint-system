// Seeds reference + demo data into MySQL from the repo's seedData.js
// (single source of truth). Idempotent: clears rows in dependency order, then
// inserts. Students aren't seeded (they sign up themselves); staff/admin
// accounts get a bcrypt-hashed password equal to their own staff ID.
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
  FACULTIES, DEPARTMENTS, PROGRAMMES, CATEGORIES, STAFF_DATABASE,
} = require(path.join('..', 'seedData.js'));


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
    for (const d of DEPARTMENTS) {
      const [res] = await conn.query('INSERT INTO departments (name, faculty_key) VALUES (?, ?)', [d.name, d.facultyKey]);
      deptId[d.name] = res.insertId;
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

    // Staff (default password is their staff_id)
    for (const s of STAFF_DATABASE) {
      const staffHash = await bcrypt.hash(s.staffId, 10);
      // department may be a real department name or a free-text office label.
      const realDeptId = deptId[s.department] ?? null;
      await conn.query(
        `INSERT INTO staff
           (staff_id, name, email, password_hash, type, faculty_key, department_id, department_label, portfolio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.staffId, s.name, s.email, staffHash, s.type, s.facultyKey || null, realDeptId, s.department, s.portfolio],
      );
    }

    // Map programmes by name to their auto-incremented MySQL IDs
    const [progRows] = await conn.query('SELECT id, name FROM programmes');
    const progId = {};
    for (const row of progRows) {
      progId[row.name] = row.id;
    }

    // Students are not seeded; they sign up fresh via the student email registration flow.
    console.log('  students skipped (signup required)');

    await conn.commit();
    console.log('✓ Seed complete');
    console.log(`  faculties=${Object.keys(FACULTIES).length} departments=${DEPARTMENTS.length} ` +
      `programmes=${PROGRAMMES.length} categories=${CATEGORIES.length} ` +
      `staff=${STAFF_DATABASE.length} students=0 (sign up required)`);
    console.log(`  staff/admin login password defaults to their own staff ID (e.g. ADMIN001 / ADMIN001)`);
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
