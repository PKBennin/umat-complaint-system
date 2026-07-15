const fs = require('fs');

const content = fs.readFileSync('../index.css', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('hero') || line.includes('Hero') || line.includes('grievance-badge') || line.includes('badge')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
