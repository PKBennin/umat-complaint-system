const fs = require('fs');

const transcriptPath = 'C:\\Users\\UARB\\.gemini\\antigravity-ide\\brain\\1b9087a8-636c-4f03-bcac-6e7826abcf28\\.system_generated\\logs\\transcript_full.jsonl';
const fileContent = fs.readFileSync(transcriptPath, 'utf8');
const lines = fileContent.split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'PLANNER_RESPONSE') {
      const tc = obj.tool_calls && obj.tool_calls.find(t => t.name === 'browser_subagent');
      if (tc) {
        console.log('Subagent step index:', obj.step_index);
        console.log('Tool call arguments:', JSON.stringify(tc.args));
        // Find corresponding SYSTEM_NOTIFICATION/SYSTEM response
        // It should be the next line or shortly after
        for (let j = i + 1; j < lines.length; j++) {
          const nextObj = JSON.parse(lines[j]);
          if (nextObj.type === 'SYSTEM_NOTIFICATION' || nextObj.type === 'USER_INPUT' || nextObj.source === 'SYSTEM') {
            console.log('System response:', JSON.stringify(nextObj).substring(0, 1000));
            break;
          }
        }
        break;
      }
    }
  } catch (e) {}
}
