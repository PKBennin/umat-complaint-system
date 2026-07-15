const fs = require('fs');

const appContent = fs.readFileSync('../app.js', 'utf8');
const lines = appContent.split('\n');

for (let idx = 1010; idx <= 1130; idx++) {
  if (lines[idx].includes('isGuestMode')) {
    console.log(`L${idx+1}: ${lines[idx]}`);
  }
}
