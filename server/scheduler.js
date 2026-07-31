// scheduler.js — Background job: 72-hour unattended complaint reminder
// Runs every hour. If a complaint stays in 'Submitted' status for 72+ hours
// with no staff action, the student gets an SMS & email asking them to wait
// 48 more hours or resend. Only fires once per complaint (tracks last_reminded_at).

const pool = require('./db');
const { sendSMS } = require('./utils/sms');
const { sendEmail } = require('./utils/email');

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS   = 60 * 60 * 1000; // check every 1 hour

async function runReminderJob() {
  console.log('[Reminder Job] Checking for unattended complaints...');
  let conn;
  try {
    conn = await pool.getConnection();

    // Find complaints that:
    //  1. Are still in 'Submitted' status (no staff has touched them)
    //  2. Were filed more than 72 hours ago
    //  3. Have never had a reminder sent (last_reminded_at IS NULL)
    const [unattended] = await conn.query(`
      SELECT c.id, c.subject, c.student_index, c.created_at,
             s.name AS student_name, s.phone, s.email
      FROM   complaints c
      JOIN   students s ON s.index_number = c.student_index
      WHERE  c.status = 'Submitted'
        AND  c.created_at <= DATE_SUB(NOW(), INTERVAL 72 HOUR)
        AND  c.last_reminded_at IS NULL
    `);

    if (unattended.length === 0) {
      console.log('[Reminder Job] No unattended complaints. All clear.');
      return;
    }

    console.log(`[Reminder Job] Found ${unattended.length} unattended complaint(s). Sending reminders...`);

    for (const c of unattended) {
      const lastName = c.student_name ? c.student_name.trim().split(' ')[0] : 'Student';

      const smsMsg =
        `[UMaT CCM] Hey ${lastName}, your complaint "${c.subject}" (Ticket ${c.id}) ` +
        `has been pending for over 72 hours. Our team is still reviewing it — ` +
        `please allow another 48 hours for a resolution. ` +
        `If you'd like to follow up, log in to the student portal and resend your complaint.`;

      const emailMsg =
        `Dear ${c.student_name},\n\n` +
        `We noticed your complaint has been pending for over 72 hours without a response.\n\n` +
        `Ticket ID : ${c.id}\n` +
        `Subject   : ${c.subject}\n` +
        `Filed On  : ${new Date(c.created_at).toLocaleString('en-GB')}\n\n` +
        `We sincerely apologise for the delay. Our team is actively working to address your concern.\n\n` +
        `What you can do:\n` +
        `  • Wait another 48 hours — we expect to resolve your complaint within that time.\n` +
        `  • Or log in to the student portal and use the "Resend" option to re-submit your complaint for immediate attention.\n\n` +
        `We value your patience and are committed to resolving your concern as quickly as possible.\n\n` +
        `Thank you,\nUMaT Campus Complaint Management System`;

      // Send SMS
      if (c.phone && c.phone !== 'N/A') {
        sendSMS(c.phone, smsMsg).catch((err) =>
          console.error(`[Reminder Job] SMS failed for ${c.id}:`, err.message)
        );
      } else {
        console.warn(`[Reminder Job] SMS skipped for ${c.id}: student ${c.student_name || c.email || '?'} has no usable phone on record.`);
      }

      // Send Email
      if (c.email) {
        sendEmail({
          to: c.email,
          subject: `[UMaT CCM] Complaint Update — Ticket ${c.id} Still Pending`,
          text: emailMsg,
        }).catch((err) =>
          console.error(`[Reminder Job] Email failed for ${c.id}:`, err.message)
        );
      }

      // Mark reminder sent so we don't spam the student
      await conn.query(
        'UPDATE complaints SET last_reminded_at = NOW() WHERE id = ?',
        [c.id]
      );
      console.log(`[Reminder Job] Reminder sent for Ticket ${c.id} (${c.student_name}).`);
    }
  } catch (err) {
    console.error('[Reminder Job] Error during job run:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

function startScheduler() {
  console.log('[Reminder Job] Scheduler started. Will check every hour for unattended complaints.');
  // Run immediately on startup to catch anything already past 72h
  runReminderJob();
  // Then repeat every hour
  setInterval(runReminderJob, CHECK_INTERVAL_MS);
}

module.exports = { startScheduler };
