const fs = require('fs');

const content = fs.readFileSync('../index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('Back to') || line.includes('back to') || line.includes('logout') || line.includes('Log Out')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
