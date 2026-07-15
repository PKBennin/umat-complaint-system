const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 1740) {
      fs.writeFileSync('step_1740_full.txt', JSON.stringify(obj, null, 2), 'utf8');
      console.log('Saved step 1740 to step_1740_full.txt');
      break;
    }
  } catch (e) {}
}
