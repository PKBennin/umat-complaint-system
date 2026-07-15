const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain';
try {
  const dirs = fs.readdirSync(brainDir);
  console.log('Brain subdirectories:', dirs);
  dirs.forEach(d => {
    const p = path.join(brainDir, d, '.system_generated', 'logs');
    if (fs.existsSync(p)) {
      console.log(`Logs exist for ${d}:`, fs.readdirSync(p));
    }
  });
} catch (e) {
  console.log('Error reading brain dir:', e.message);
}
