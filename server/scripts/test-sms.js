// One-off SMS flow test: sends a test message via the app's own sendSMS() utility.
// Usage: node scripts/test-sms.js <phone>   (e.g. 0550722898)
require('dotenv').config();
const { sendSMS } = require('../utils/sms.js');

const phone = process.argv[2];
if (!phone) {
  console.error('Usage: node scripts/test-sms.js <phone>');
  process.exit(1);
}

sendSMS(phone, 'UMaT Complaint System test: if you receive this, SMS works. Reply not needed.')
  .then(ok => {
    console.log(ok ? 'RESULT: SMS API accepted' : 'RESULT: SMS FAILED');
    process.exitCode = ok ? 0 : 1;
  });
