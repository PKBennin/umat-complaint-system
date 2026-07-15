const fs = require('fs');

const cssContent = fs.readFileSync('../index.css', 'utf8');
const lines = cssContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('hero-bg-slides')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
