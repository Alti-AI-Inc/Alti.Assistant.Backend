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
    <h1>You have been invited to join ${tenantName} on Inso.Assistant</h1>
    <p>Please click the link below to accept the invitation and set up your account:</p>
    <a href="${invitationLink}">${invitationLink}</a>
  `;
  const textContent = `You have been invited to join ${tenantName} on Inso.Assistant. Click here to accept: ${invitationLink}`;
  const subject = `Invitation to join workspace ${tenantName} on Inso.Assistant`;

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

/**
 * Sends an email to notify a user that additional payment action is required (e.g., 3D Secure verification).
 * 
 * @param {Object} data
 * @param {string} data.to - Recipient email.
 * @param {string} data.hostedInvoiceUrl - The URL to Stripe's hosted invoice page.
 * @param {string} data.amountDue - The formatted amount due (e.g., "$10.00 USD").
 */
export const sendPaymentActionRequiredEmail = async ({ to, hostedInvoiceUrl, amountDue }) => {
  const htmlContent = `
    <h1>Payment Action Required</h1>
    <p>Your subscription payment of <strong>${amountDue}</strong> requires additional authentication or action to complete.</p>
    <p>Please click the link below to complete the payment securely:</p>
    <div style="margin: 20px 0;">
      <a href="${hostedInvoiceUrl}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Complete Payment</a>
    </div>
    <p>If the button doesn't work, copy and paste this URL into your browser:</p>
    <p><a href="${hostedInvoiceUrl}">${hostedInvoiceUrl}</a></p>
  `;
  const textContent = `Your subscription payment of ${amountDue} requires action. Please visit: ${hostedInvoiceUrl} to complete payment.`;
  const subject = `Action Required: Complete your subscription payment`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: to,
    text: textContent,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Payment action required email sent to ${to}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send payment action required email to ${to}:`, error);
    throw error;
  }
};

/**
 * Sends a trial ending reminder email.
 * 
 * @param {Object} data
 * @param {string} data.to - Recipient email.
 * @param {number} data.trialEnd - Unix timestamp of trial end date.
 */
export const sendTrialEndingEmail = async ({ to, trialEnd }) => {
  const endDate = new Date(trialEnd * 1000).toLocaleDateString();
  const htmlContent = `
    <h1>Your Inso.Assistant Trial is Ending Soon</h1>
    <p>Your free trial is scheduled to end on <strong>${endDate}</strong>.</p>
    <p>After this date, your subscription will automatically renew at the regular rate of your selected plan.</p>
    <p>Thank you for using Inso.Assistant!</p>
  `;
  const textContent = `Your free trial is ending on ${endDate}. Thank you for using Inso.Assistant!`;
  const subject = `Your free trial is ending soon`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: to,
    text: textContent,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Trial ending email sent to ${to}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send trial ending email to ${to}:`, error);
    throw error;
  }
};

/**
 * Sends an alert to the workspace owner when storage limits are reached/exceeded.
 * 
 * @param {Object} data
 * @param {string} data.to - Workspace admin/owner email.
 * @param {string} data.tenantName - Workspace/tenant name.
 * @param {number} data.storageUsed - Storage used in bytes.
 * @param {number} data.storageLimit - Storage limit in bytes.
 */
export const sendStorageLimitAlert = async ({ to, tenantName, storageUsed, storageLimit }) => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const usedStr = formatBytes(storageUsed);
  const limitStr = formatBytes(storageLimit);

  const htmlContent = `
    <h1>Workspace Storage Limit Reached</h1>
    <p>Your workspace <strong>${tenantName}</strong> has reached or is about to exceed its storage limit.</p>
    <p><strong>Current Usage:</strong> ${usedStr} / ${limitStr}</p>
    <p>Please upgrade your subscription plan or delete unnecessary files to free up space.</p>
  `;
  const textContent = `Your workspace ${tenantName} has reached its storage limit. Current Usage: ${usedStr} / ${limitStr}. Please upgrade your plan or delete files to free up space.`;
  const subject = `[Action Required] Storage Limit Reached for Workspace ${tenantName}`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: to,
    text: textContent,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Storage limit alert sent to workspace admin ${to} for tenant ${tenantName}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send storage limit alert email to ${to}:`, error);
    throw error;
  }
};

/**
 * Sends an email to notify a user that their subscription payment has failed.
 * 
 * @param {Object} data
 * @param {string} data.to - Recipient email.
 * @param {string} data.hostedInvoiceUrl - The URL to Stripe's hosted invoice page.
 * @param {string} data.amountDue - The formatted amount due (e.g., "$10.00 USD").
 */
export const sendPaymentFailedEmail = async ({ to, hostedInvoiceUrl, amountDue }) => {
  const htmlContent = `
    <h1>Subscription Payment Failed</h1>
    <p>We were unable to complete your subscription payment of <strong>${amountDue}</strong>.</p>
    <p>To keep your account active and avoid any service interruptions, please update your payment details or complete the payment manually:</p>
    <div style="margin: 20px 0;">
      <a href="${hostedInvoiceUrl}" style="padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Update Payment Details</a>
    </div>
    <p>If the button doesn't work, copy and paste this URL into your browser:</p>
    <p><a href="${hostedInvoiceUrl}">${hostedInvoiceUrl}</a></p>
  `;
  const textContent = `Your subscription payment of ${amountDue} failed. Please visit: ${hostedInvoiceUrl} to update payment details and keep your account active.`;
  const subject = `Urgent: Your subscription payment has failed`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: to,
    text: textContent,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Payment failed email sent to ${to}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send payment failed email to ${to}:`, error);
    throw error;
  }
};

export const emailService = {
  sendWorkspaceInvitation,
  sendPaymentActionRequiredEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
  sendStorageLimitAlert,
};

export default emailService;

