const fs = require('fs');

const cssContent = fs.readFileSync('../style.css', 'utf8');
const lines = cssContent.split('\n');
const targets = [168, 512, 579, 963, 1732, 2086];

targets.forEach(t => {
  console.log(`--- Line ${t} ---`);
  const start = Math.max(0, t - 6);
  const end = Math.min(lines.length - 1, t + 4);
  for (let i = start; i <= end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
});
