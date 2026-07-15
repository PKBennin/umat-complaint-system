const fs = require('fs');

const content = fs.readFileSync('../admin.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('display') && line.includes('block')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
