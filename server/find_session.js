const fs = require('fs');

const appContent = fs.readFileSync('../app.js', 'utf8');
const lines = appContent.split('\n');

let found = false;
lines.forEach((line, idx) => {
  if (line.includes('checkStudentSession')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    // Print next 20 lines
    for (let i = 1; i <= 20; i++) {
      console.log(`L${idx+1+i}: ${lines[idx+i]}`);
    }
    found = true;
  }
});

if (!found) {
  console.log('checkStudentSession not found!');
}
