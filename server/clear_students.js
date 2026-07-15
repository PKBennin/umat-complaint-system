require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    console.log('Clearing all students and complaints from database...');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('DELETE FROM action_logs');
    await pool.query('DELETE FROM comments');
    await pool.query('DELETE FROM internal_notes');
    await pool.query('DELETE FROM directives');
    await pool.query('DELETE FROM appointments');
    const [resComplaints] = await pool.query('DELETE FROM complaints');
    const [resStudents] = await pool.query('DELETE FROM students');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`Successfully deleted ${resComplaints.affectedRows} complaints and ${resStudents.affectedRows} students.`);
    await pool.end();
    console.log('Database clear operation successful!');
  } catch (e) {
    console.error('Failed to clear database tables:', e);
  }
})();
