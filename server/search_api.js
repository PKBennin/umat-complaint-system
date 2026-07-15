const fs = require('fs');
const path = require('path');

const serverDir = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\scratch\\umat-complaint-system\\server';

function searchInDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules') searchInDir(full);
    } else if (f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('/track')) {
        console.log(`FOUND in ${full}:`);
        content.split('\n').forEach((line, idx) => {
          if (line.includes('/track') || line.includes('track')) {
            console.log(`L${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchInDir(serverDir);
