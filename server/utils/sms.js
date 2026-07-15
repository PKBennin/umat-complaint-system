// UMaT Campus Complaint System - Arkesel SMS Integration Utility.
// Connects to Arkesel SMS V2 API (https://sms.arkesel.com/api/v2/sms/send)

/**
 * Sends a transactional SMS via Arkesel SMS V2 API
 * @param {string} phoneNumber - Student telephone number (e.g. 0535620797)
 * @param {string} message - Message body content
 */
async function sendSMS(phoneNumber, message) {
  const apiKey = process.env.ARKESEL_API_KEY;
  const senderId = process.env.ARKESEL_SENDER_ID || 'UMat CCM';

  if (!apiKey) {
    console.log('\n--- [SMS SIMULATOR LOG] ---');
    console.log(`Recipient: ${phoneNumber}`);
    console.log(`Sender ID: ${senderId}`);
    console.log(`Message:   ${message}`);
    console.log('---------------------------\n');
    return true; // Simulate success when credentials are not yet set
  }

  // Format local phone number to international format (e.g. 0535620797 -> 233535620797)
  let formattedNumber = phoneNumber.trim().replace(/[\s+-]/g, '');
  if (formattedNumber.startsWith('0')) {
    formattedNumber = '233' + formattedNumber.substring(1);
  }

  try {
    const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: senderId.substring(0, 11),
        recipients: [formattedNumber],
        message: message
      })
    });

    const data = await response.json();
    
    if (response.ok && (data.status === 'success' || String(data.code) === '1000' || String(data.status) === '1000')) {
      console.log(`[SMS Sent] Successfully alerted ${formattedNumber} via Arkesel V2 POST API.`);
      return true;
    } else {
      console.error('[SMS Failed] Arkesel V2 Response Error:', JSON.stringify(data));
      return false;
    }
  } catch (error) {
    console.error('[SMS Failed] Network error contacting Arkesel V2 API:', error.message);
    return false;
  }
}

module.exports = { sendSMS };
