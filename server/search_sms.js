const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        searchDir(filePath);
      }
    } else if (file.endsWith('.js') || file.endsWith('.env') || file.endsWith('.json')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.toLowerCase().includes('sms') || content.toLowerCase().includes('arkasel')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('sms') || line.toLowerCase().includes('arkasel') || line.toLowerCase().includes('api')) {
            console.log(`${file} L${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDir('.');
