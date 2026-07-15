const fs = require('fs');
const readline = require('readline');

async function searchTranscript() {
  const filePath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript.jsonl';
  if (!fs.existsSync(filePath)) {
    console.log("No transcript file found at " + filePath);
    return;
  }
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (line.toLowerCase().includes('arkasel') || line.toLowerCase().includes('sms') || line.toLowerCase().includes('api')) {
      console.log(`L${lineCount}: ${line.substring(0, 300)}...`);
    }
  }
}

searchTranscript();
