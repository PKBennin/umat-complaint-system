// UMaT Campus Complaint System - Email Utility

/**
 * Sends a transactional email alert.
 * If SMTP credentials are not configured, it simulates sending by logging to the console.
 * 
 * @param {object} params
 * @param {string} params.to - Recipient email address (e.g. student@st.umat.edu.gh)
 * @param {string} params.subject - Subject line
 * @param {string} params.text - Plain text content
 * @param {string} [params.html] - Optional HTML content
 */
async function sendEmail({ to, subject, text, html }) {
  console.log('\n--- [EMAIL SIMULATOR LOG] ---');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message: ${text}`);
  console.log('-----------------------------\n');

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'no-reply@umat.edu.gh';

  if (!smtpHost || !smtpUser || !smtpPass) {
    // If SMTP details are not configured, simulate success silently after the log
    return true;
  }

  try {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      console.warn('[Email Warning] SMTP configured but "nodemailer" module is not installed. Please run "npm install nodemailer" in the server directory.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const info = await transporter.sendMail({
      from: `"UMaT Campus Complaint System" <${smtpFrom}>`,
      to,
      subject,
      text,
      html
    });

    console.log(`[Email Sent] Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email Failed] SMTP error:', error.message);
    return false;
  }
}

module.exports = { sendEmail };
