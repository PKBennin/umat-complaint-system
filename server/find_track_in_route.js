const fs = require('fs');

const content = fs.readFileSync('routes/complaints.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('track') || line.includes('/track')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
