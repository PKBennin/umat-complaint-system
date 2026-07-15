const fs = require('fs');

const cssContent = fs.readFileSync('../style.css', 'utf8');
const lines = cssContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('btn-outline-white')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    for (let i = 1; i <= 10; i++) {
      console.log(`L${idx+1+i}: ${lines[idx+i]}`);
    }
  }
});
