const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('[resetFilingForm]') || line.includes('preSelectedCategory')) {
    console.log(`LINE ${idx + 1}:`);
    // Print first 500 chars
    console.log(line.substring(0, 1000));
  }
});
