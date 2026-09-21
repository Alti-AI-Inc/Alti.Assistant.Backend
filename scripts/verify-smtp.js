#!/usr/bin/env node
/**
 * SMTP Email Verification Script
 * Tests Liberty Center One SMTP connectivity and deliverability.
 *
 * Usage: node scripts/verify-smtp.js recipient@example.com
 */
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const recipient = process.argv[2];
if (!recipient) {
  console.error('Usage: node scripts/verify-smtp.js recipient@example.com');
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SENDER_MAIL } = process.env;

console.log('── SMTP Configuration ──');
console.log(`  Host:   ${SMTP_HOST || '❌ MISSING'}`);
console.log(`  Port:   ${SMTP_PORT || '❌ MISSING'}`);
console.log(`  User:   ${SMTP_USER || '❌ MISSING'}`);
console.log(`  Pass:   ${SMTP_PASSWORD ? '✅ SET' : '❌ MISSING'}`);
console.log(`  From:   ${SENDER_MAIL || SMTP_USER || '❌ MISSING'}`);
console.log(`  To:     ${recipient}`);
console.log('');

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.error('❌ Missing SMTP environment variables. Check your .env file.');
  console.error('   Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: parseInt(SMTP_PORT || '587'),
  secure: SMTP_PORT === '465',
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
});

console.log('1/3 Verifying SMTP connection...');
try {
  await transporter.verify();
  console.log('    ✅ SMTP connection successful\n');
} catch (err) {
  console.error(`    ❌ SMTP connection failed: ${err.message}`);
  console.error('');
  console.error('    Troubleshooting:');
  console.error('    - Verify SMTP_HOST and SMTP_PORT are correct');
  console.error('    - Verify credentials (SMTP_USER, SMTP_PASSWORD)');
  console.error('    - Check firewall rules on Liberty Center One');
  console.error('    - Ensure port 587 (or 465) is open');
  process.exit(1);
}

console.log('2/3 Sending test email...');
try {
  const info = await transporter.sendMail({
    from: `"Alti AI Test" <${SENDER_MAIL || SMTP_USER}>`,
    to: recipient,
    subject: '✅ Alti AI SMTP Test — Liberty Center One',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto;">
        <h2 style="color: #111;">SMTP Test Successful</h2>
        <p>This email confirms that SMTP is working correctly on Liberty Center One.</p>
        <p style="color: #666;">
          Host: ${SMTP_HOST}<br>
          Sent at: ${new Date().toISOString()}
        </p>
        <hr>
        <p style="color: #999; font-size: 12px;">Alti AI — Sovereign Infrastructure</p>
      </div>
    `,
  });
  console.log(`    ✅ Email sent: ${info.messageId}\n`);
} catch (err) {
  console.error(`    ❌ Failed to send: ${err.message}`);
  process.exit(1);
}

console.log('3/3 DNS record recommendations:');
console.log('');
console.log('    Add these DNS records for altihq.com to avoid spam folders:');
console.log('');
console.log('    SPF  (TXT):  v=spf1 a mx include:[your-smtp-host] ~all');
console.log('    DKIM (TXT):  Generate via your SMTP provider dashboard');
console.log('    DMARC (TXT): v=DMARC1; p=quarantine; rua=mailto:dmarc@altihq.com');
console.log('');
console.log('    ✅ SMTP verification complete');
