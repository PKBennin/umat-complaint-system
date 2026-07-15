const fs = require('fs');

const content = fs.readFileSync('../app.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('calculateRouting') || line.includes('routing') || line.includes('Dean') || line.includes('HOD')) {
    if (line.includes('function') || line.includes('=')) {
      console.log(`L${idx+1}: ${line.trim()}`);
    }
  }
});
