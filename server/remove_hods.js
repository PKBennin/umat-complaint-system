const pool = require('./db');

async function run() {
  try {
    console.log("Deleting all HOD accounts from staff table...");
    const [result] = await pool.query("DELETE FROM staff WHERE type = 'HOD'");
    console.log("Successfully deleted HODs. Rows affected:", result.affectedRows);
  } catch (e) {
    console.error("Error deleting HODs:", e);
  } finally {
    await pool.end();
  }
}

run();
