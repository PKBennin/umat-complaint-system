const fs = require('fs');

const indexContent = fs.readFileSync('../index.html', 'utf8');
const indexLines = indexContent.split('\n');

indexLines.forEach((line, idx) => {
  if (line.includes('password123')) {
    console.log(`index.html L${idx+1}: ${line.trim()}`);
  }
});

const adminContent = fs.readFileSync('../admin.html', 'utf8');
const adminLines = adminContent.split('\n');

adminLines.forEach((line, idx) => {
  if (line.includes('password123')) {
    console.log(`admin.html L${idx+1}: ${line.trim()}`);
  }
});
