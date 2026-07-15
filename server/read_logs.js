const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

let matchedSteps = [];
for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (JSON.stringify(obj).includes('capture_browser_console_logs')) {
      matchedSteps.push(obj);
      if (matchedSteps.length >= 5) break;
    }
  } catch (e) {
    // ignore
  }
}

let output = '';
matchedSteps.reverse().forEach(obj => {
  output += 'STEP ' + obj.step_index + ':\n' + JSON.stringify(obj, null, 2) + '\n\n';
});

fs.writeFileSync('logs_output.txt', output, 'utf8');
console.log('Logs written to logs_output.txt');
