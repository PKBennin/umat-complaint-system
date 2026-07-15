const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) return;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 335) {
      console.log('STEP 335:');
      console.log(obj.content);
    }
    if (obj.step_index === 339) {
      console.log('STEP 339:');
      console.log(obj.content);
    }
  } catch (e) {}
}
