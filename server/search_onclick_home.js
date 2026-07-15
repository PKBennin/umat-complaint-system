const fs = require('fs');

const content = fs.readFileSync('../index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('onclick') && (line.includes('home') || line.includes('Home') || line.includes('landing') || line.includes('Landing'))) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
