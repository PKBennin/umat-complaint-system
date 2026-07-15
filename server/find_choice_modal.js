const fs = require('fs');

const htmlContent = fs.readFileSync('../index.html', 'utf8');
const lines = htmlContent.split('\n');

let inModal = false;
lines.forEach((line, idx) => {
  if (line.includes('id="submit-method-choice-modal"') || line.includes('class="modal"') && line.includes('choice')) {
    inModal = true;
  }
  if (inModal) {
    console.log(`L${idx + 1}: ${line}`);
    if (line.includes('</div>') && line.includes('</div>') && line.includes('</div>') && idx > 500) {
      // Rough guess
    }
  }
});
