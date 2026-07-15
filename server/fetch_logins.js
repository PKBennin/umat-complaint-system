const pool = require('./db');

async function run() {
  try {
    const [students] = await pool.query('SELECT index_number, name, email FROM students ORDER BY index_number ASC');
    const [staff] = await pool.query('SELECT staff_id, name, email, portfolio, type FROM staff ORDER BY staff_id ASC');

    console.log('--- STUDENT LOGINS (Login with Index Number) ---');
    students.forEach(s => {
      console.log(`Index: ${s.index_number} | Name: ${s.name} | Email: ${s.email}`);
    });

    console.log('\n--- STAFF / ADMIN LOGINS (Login with Staff ID) ---');
    staff.forEach(st => {
      console.log(`ID: ${st.staff_id} | Name: ${st.name} | Role: ${st.type} | Portfolio: ${st.portfolio}`);
    });
  } catch (e) {
    console.error('Error fetching logins:', e);
  } finally {
    await pool.end();
  }
}

run();
