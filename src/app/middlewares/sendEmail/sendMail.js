import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import nodemailer from 'nodemailer';

/**
 * Send email via Aphura OpenStack SMTP.
 * No third-party email services — sent natively from our infrastructure.
 */
export const sendMailWithNodeMailer = async (mailData) => {
  const { sub, message, userEmail } = mailData;

  const transporter = nodemailer.createTransport({
    host: config.mail.smtp_host,
    port: parseInt(config.mail.smtp_port || '587'),
    secure: config.mail.smtp_port === '465',
    auth: {
      user: config.mail.smtp_user,
      pass: config.mail.smtp_password,
    },
    // Aphura OpenStack SMTP — allow self-signed certs in dev
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  const info = await transporter.sendMail({
    from: `"Aphura AI" <${config.mail.sender_mail || config.mail.smtp_user}>`,
    to: userEmail,
    subject: sub,
    html: message,
  });

  logger.info(`Email sent to ${userEmail}: ${info.messageId}`);
  return info;
};

// Backward-compatible export alias
export const sendMailWithMailGun = sendMailWithNodeMailer;
