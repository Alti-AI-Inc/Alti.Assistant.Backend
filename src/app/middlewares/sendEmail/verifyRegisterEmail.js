import nodemailer from 'nodemailer';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Send email using standard SMTP (provider-agnostic).
 * Replaces the previous googleapis OAuth2 approach.
 */
export const sendMailForRegisterWithGmail = async (data) => {
  let transporter = nodemailer.createTransport({
    host: config.mail.smtp_host || 'smtp.gmail.com',
    port: parseInt(config.mail.smtp_port || '587'),
    secure: false,
    auth: {
      user: config.mail.smtp_user || config.mail.sender_mail,
      pass: config.mail.smtp_password,
    },
  });

  const mailData = {
    from: config.mail.sender_mail,
    to: data.to,
    subject: data.subject,
    html: data.text,
  };

  let info = await transporter.sendMail(mailData);

  logger.info('Message sent: %s', info.messageId);

  return info.messageId;
};
