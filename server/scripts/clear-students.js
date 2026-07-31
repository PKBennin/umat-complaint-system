// One-off cleanup: deletes all student login accounts, preserving complaints
// by re-pointing them at a placeholder student (satisfies the NOT NULL FK).
// Usage: node scripts/clear-students.js
require('dotenv').config();
const pool = require('../db.js');

const PLACEHOLDER_INDEX = '0000000000';
const PLACEHOLDER_EMAIL = 'deleted-student@placeholder.umat.local';

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[before]] = await conn.query('SELECT COUNT(*) AS n FROM students');
    const [[complaints]] = await conn.query('SELECT COUNT(*) AS n FROM complaints');

    // Idempotent placeholder insert (random unguessable password).
    const [ph] = await conn.query(
      `INSERT INTO students (index_number, name, email, phone, password_hash, level, is_profile_complete)
       VALUES (?, ?, ?, NULL, ?, NULL, 0)
       ON DUPLICATE KEY UPDATE index_number = index_number`,
      [PLACEHOLDER_INDEX, 'Deleted Student', PLACEHOLDER_EMAIL,
       require('crypto').randomBytes(32).toString('hex')]
    );

    const [repointed] = await conn.query(
      `UPDATE complaints SET student_index = ? WHERE student_index IN (SELECT index_number FROM students WHERE index_number <> ?)`,
      [PLACEHOLDER_INDEX, PLACEHOLDER_INDEX]
    );

    const [result] = await conn.query('DELETE FROM students WHERE index_number <> ?', [PLACEHOLDER_INDEX]);

    await conn.commit();

    const [[after]] = await conn.query('SELECT COUNT(*) AS n FROM students');
    console.log(`Students before: ${before.n}`);
    console.log(`Complaints before (unchanged): ${complaints.n}`);
    console.log(`Complaints re-pointed to placeholder: ${repointed.affectedRows}`);
    console.log(`Student accounts deleted: ${result.affectedRows}`);
    console.log(`Students after: ${after.n}`);
    console.log(ph.insertId ? 'Placeholder student created.' : 'Placeholder student already existed.');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
