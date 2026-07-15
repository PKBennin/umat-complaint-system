const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 1716) {
      // Find Step 106 console logs call response inside subagent run content
      // Let's search the actionContent string for Step 106
      const content = obj.content;
      const idx = content.indexOf('Step 106');
      if (idx !== -1) {
        console.log(content.substring(idx, idx + 2000));
      } else {
        console.log('Step 106 not found in content');
      }
      break;
    }
  } catch (e) {}
}
