const fs = require('fs');

const content = fs.readFileSync('routes/complaints.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('student_index') || line.includes('anonymous') || line.includes('index_number')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
