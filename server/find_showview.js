const fs = require('fs');

const appContent = fs.readFileSync('../app.js', 'utf8');
const lines = appContent.split('\n');

let found = false;
lines.forEach((line, idx) => {
  if (line.includes('showView(viewName)')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    for (let i = 1; i <= 35; i++) {
      console.log(`L${idx+1+i}: ${lines[idx+i]}`);
    }
    found = true;
  }
});
