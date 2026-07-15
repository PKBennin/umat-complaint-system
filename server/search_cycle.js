const fs = require('fs');

const content = fs.readFileSync('../app.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('startHeroBackgroundCycle')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    // Print next 20 lines
    for (let i = 1; i <= 20; i++) {
      console.log(`L${idx+1+i}: ${lines[idx+i]}`);
    }
  }
});
