const fs = require('fs');

const appContent = fs.readFileSync('../app.js', 'utf8');
const lines = appContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('/complaints')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
