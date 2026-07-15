const fs = require('fs');

const content = fs.readFileSync('../index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('student-signin-modal')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    for (let i = 1; i <= 20; i++) {
      console.log(`L${idx+1+i}: ${lines[idx+i]}`);
    }
  }
});
