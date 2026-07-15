const fs = require('fs');

const content = fs.readFileSync('../admin.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('confirm') || line.includes('Confirm')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
