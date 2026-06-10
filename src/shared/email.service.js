import { sendMailWithNodeMailer } from '../app/middlewares/sendEmail/sendMail.js';
import { logger } from './logger.js';

/**
 * Sends a workspace invitation email.
 * 
 * @param {Object} data
 * @param {string} data.to - Recipient email.
 * @param {string} data.tenantName - Name of the workspace/tenant.
 * @param {string} data.invitationLink - Invitation acceptance link.
 */
export const sendWorkspaceInvitation = async ({ to, tenantName, invitationLink }) => {
  const htmlContent = `
    <h1>You have been invited to join ${tenantName} on Alti.Assistant</h1>
    <p>Please click the link below to accept the invitation and set up your account:</p>
    <a href="${invitationLink}">${invitationLink}</a>
  `;
  const textContent = `You have been invited to join ${tenantName} on Alti.Assistant. Click here to accept: ${invitationLink}`;
  const subject = `Invitation to join workspace ${tenantName} on Alti.Assistant`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: to,
    text: textContent,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Workspace invitation sent to ${to} for tenant ${tenantName}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send workspace invitation email to ${to}:`, error);
    throw error;
  }
};

export const emailService = {
  sendWorkspaceInvitation,
};

export default emailService;
