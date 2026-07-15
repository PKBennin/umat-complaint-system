const fs = require('fs');

const cssContent = fs.readFileSync('../style.css', 'utf8');
const lines = cssContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('hero-bg') || line.includes('slideshow') || line.includes('slide') || line.includes('login-bg')) {
    if (line.includes('{') || line.includes('background') || line.includes('linear-gradient')) {
      console.log(`L${idx+1}: ${line.trim()}`);
    }
  }
});
