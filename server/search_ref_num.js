const fs = require('fs');
const path = require('path');

function searchFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('reference number') || line.toLowerCase().includes('ref number') || line.toLowerCase().includes('ref. number')) {
      console.log(`MATCH in ${file} line ${idx+1}: ${line.trim()}`);
    }
  });
}

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') searchDir(full);
    } else if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.sql') || f.endsWith('.css')) {
      searchFile(full);
    }
  });
}

searchDir('C:\\Users\\UARB\\.gemini\\antigravity-ide\\scratch\\umat-complaint-system');
