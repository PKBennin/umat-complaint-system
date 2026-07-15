const fs = require('fs');

const content = fs.readFileSync('../app.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('confirm') || line.includes('Confirm') || line.includes('goTo')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
