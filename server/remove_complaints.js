const pool = require('./db');

async function run() {
  try {
    console.log('Connecting to database and deleting all complaints...');
    const [result] = await pool.query('DELETE FROM complaints');
    console.log('Successfully deleted all complaints. Rows affected:', result.affectedRows);
  } catch (e) {
    console.error('Error deleting complaints:', e);
  } finally {
    await pool.end();
  }
}

run();
