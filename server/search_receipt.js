const fs = require('fs');

const content = fs.readFileSync('../app.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('receipt') || line.includes('Receipt') || line.includes('success')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
