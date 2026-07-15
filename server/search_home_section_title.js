const fs = require('fs');

const cssContent = fs.readFileSync('../style.css', 'utf8');
const lines = cssContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('home-section-title') || line.includes('section-desc')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
