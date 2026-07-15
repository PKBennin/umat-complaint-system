const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 1888) {
      fs.writeFileSync('step_1888_full.txt', JSON.stringify(obj, null, 2), 'utf8');
      console.log('Saved step 1888 to step_1888_full.txt');
    }
    if (obj.step_index === 1889) {
      fs.writeFileSync('step_1889_full.txt', JSON.stringify(obj, null, 2), 'utf8');
      console.log('Saved step 1889 to step_1889_full.txt');
    }
  } catch (e) {}
}
