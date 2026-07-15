const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  console.log('Starting migration and database reset...');
  
  // Connection without database selection in case it doesn't exist
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    console.log('Executing schema.sql DDL statements...');
    await connection.query(schemaSql);
    console.log('✓ Tables recreated successfully.');
    
    // Close temp connection
    await connection.end();
    
    // Require and trigger seed.js logic
    console.log('Running seeder...');
    // We run it as a subprocess to keep it clean and independent
    const { execSync } = require('child_process');
    const result = execSync(`"${process.execPath}" seed.js`, { cwd: __dirname, encoding: 'utf8' });
    console.log(result);
    
    console.log('✓ Migration and seeding completed successfully!');
  } catch (err) {
    console.error('✗ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
