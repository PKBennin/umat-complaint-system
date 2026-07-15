const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain';
const subdirs = fs.readdirSync(brainDir);

subdirs.forEach(d => {
  const p = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(p)) {
    const stats = fs.statSync(p);
    console.log(`Folder: ${d}, mtime: ${stats.mtime.toISOString()}`);
  }
});
