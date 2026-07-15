const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain';
const subdirs = fs.readdirSync(brainDir);

let output = '';

subdirs.forEach(d => {
  const logDir = path.join(brainDir, d, '.system_generated', 'logs');
  if (!fs.existsSync(logDir)) return;
  const files = fs.readdirSync(logDir);
  files.forEach(f => {
    if (!f.endsWith('.jsonl')) return;
    const filePath = path.join(logDir, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('Available options') || line.includes('[resetFilingForm]')) {
        // Exclude MODEL tool calls
        if (!line.includes('"source":"MODEL"') && !line.includes('write_to_file')) {
          output += `MATCH in ${d}/${f} line ${idx+1}:\n${line}\n\n`;
        }
      }
    });
  });
});

fs.writeFileSync('all_matches.txt', output, 'utf8');
console.log('Results written to all_matches.txt');
