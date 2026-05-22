import formData from 'form-data';
import Mailgun from 'mailgun.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

import nodemailer from 'nodemailer';
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
  username: 'api',
  key: `${config.mailgun?.mailgun_key}`,
});

export const sendMailWithMailGun = async (mailData) => {
  const { sub, message, userEmail } = mailData;

  return new Promise((resolve, reject) => {
    mg.messages
      .create(config.mailgun?.mailgun_domain, {
        from: config.mailgun?.mailgun_from,
        to: userEmail,
        subject: sub,
        html: message,
      })
      .then((msg) => {
        logger.info(msg); // logs response data
        resolve(msg);
      })
      .catch((err) => {
        console.error(err); // logs any error
        reject(err);
      });
  });
};

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
    from: `"Alti AI" <${config.mail.google_smtp_user}>`, // sender address
    to: userEmail, // list of receivers
    subject: sub, // Subject line
    html: message, // html body
  });
  logger.info('Message sent: %s', info.messageId);
  return info;
};
