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
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('PS1') || content.includes('HOD') || content.includes('recipient') || content.includes('routing')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('HOD') || line.includes('Dean') || line.includes('assigned_staff_id') || line.includes('routing')) {
            console.log(`${file} L${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDir('.');
