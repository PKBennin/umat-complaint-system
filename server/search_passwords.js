const fs = require('fs');

const content = fs.readFileSync('../index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('type="password"')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
