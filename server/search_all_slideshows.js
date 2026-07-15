const fs = require('fs');

const appContent = fs.readFileSync('../app.js', 'utf8');
appContent.split('\n').forEach((line, idx) => {
  if (line.includes('setInterval') || line.includes('slide')) {
    console.log(`app.js L${idx+1}: ${line.trim()}`);
  }
});

const htmlContent = fs.readFileSync('../index.html', 'utf8');
htmlContent.split('\n').forEach((line, idx) => {
  if (line.includes('setInterval') || line.includes('slide') || line.includes('script')) {
    console.log(`index.html L${idx+1}: ${line.trim()}`);
  }
});
