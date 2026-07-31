require('dotenv').config();
const pool = require('./db');
(async () => {
  const [r] = await pool.query("SHOW COLUMNS FROM staff LIKE 'type'");
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})();
