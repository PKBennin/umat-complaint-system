const fs = require('fs');

const htmlContent = fs.readFileSync('../index.html', 'utf8');
const lines = htmlContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('Track') || line.includes('track') || line.includes('Reference') || line.includes('reference')) {
    if (line.includes('<h2>') || line.includes('id=') || line.includes('class=')) {
      console.log(`L${idx + 1}: ${line.trim()}`);
    }
  }
});
