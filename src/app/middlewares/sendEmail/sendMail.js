import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import nodemailer from 'nodemailer';

export const sendMailWithNodeMailer = async (mailData) => {
  const { sub, message, userEmail } = mailData;

  // Create a transporter object using SMTP transport
  const transporter = nodemailer.createTransport({
    host: config.mail.google_smtp_host,
    port: config.mail.google_smtp_port,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.mail.google_smtp_user,
      pass: config.mail.google_smtp_password,
    },
  });

  // Send mail with defined transport object
  const info = await transporter.sendMail({
    from: `"Inso Assistant" <${config.mail.google_smtp_user}>`, // sender address
    to: userEmail, // list of receivers
    subject: sub, // Subject line
    html: message, // html body
  });
  logger.info('Message sent: %s', info.messageId);
  return info;
};

// Backward-compatible export alias for any legacy modules
export const sendMailWithMailGun = sendMailWithNodeMailer;
