const fs = require('fs');

const content = fs.readFileSync('../index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('back') || line.toLowerCase().includes('crumb')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
