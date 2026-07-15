const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('rgba(6, 43') || line.includes('rgba(13, 82') || line.includes('linear-gradient')) {
    if (line.includes('replace_file_content') || line.includes('diff_block_start')) {
      console.log(`L${idx+1}: ${line.substring(0, 500)}`);
    }
  }
});
