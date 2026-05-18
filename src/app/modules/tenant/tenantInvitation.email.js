import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import {
  generateInvitationEmailHTML,
  generateInvitationEmailText,
  getInvitationEmailSubject,
} from './templates/invitationEmail.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

/**
 * Email rate limiting cache
 * Prevents spam by tracking email sends per email address
 */
const emailRateLimitCache = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_EMAILS_PER_HOUR = 5; // Max 5 invitation emails per hour per email address

/**
 * Check if email can be sent (rate limiting)
 * @param {string} email - Recipient email address
 * @returns {boolean} True if email can be sent
 */
const checkEmailRateLimit = (email) => {
  const now = Date.now();
  const key = email.toLowerCase();

  if (!emailRateLimitCache.has(key)) {
    emailRateLimitCache.set(key, [now]);
    return true;
  }

  const timestamps = emailRateLimitCache.get(key);
  // Remove timestamps older than rate limit window
  const recentTimestamps = timestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );

  if (recentTimestamps.length >= MAX_EMAILS_PER_HOUR) {
    logger.warn(`Rate limit exceeded for email: ${email}`);
    return false;
  }

  recentTimestamps.push(now);
  emailRateLimitCache.set(key, recentTimestamps);
  return true;
};

/**
 * Clean up old rate limit entries (run periodically)
 */
setInterval(() => {
  const now = Date.now();
  for (const [email, timestamps] of emailRateLimitCache.entries()) {
    const recentTimestamps = timestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW
    );
    if (recentTimestamps.length === 0) {
      emailRateLimitCache.delete(email);
    } else {
      emailRateLimitCache.set(email, recentTimestamps);
    }
  }
}, RATE_LIMIT_WINDOW); // Clean up every hour

/**
 * Send invitation email with retry logic
 * @param {Object} invitationData - Invitation data
 * @param {string} invitationData.email - Recipient email
 * @param {string} invitationData.inviterName - Name of person sending invite
 * @param {string} invitationData.tenantName - Tenant/workspace name
 * @param {string} invitationData.token - Invitation token
 * @param {string} invitationData.role - Role (admin/member)
 * @param {number} invitationData.expiryDays - Days until expiry
 * @returns {Promise<Object>} Email send result
 */
export const sendInvitationEmail = async (invitationData) => {
  const {
    email,
    inviterName,
    tenantName,
    token,
    role = 'member',
    expiryDays = 7,
  } = invitationData;

  // Check rate limiting
  if (!checkEmailRateLimit(email)) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  // Generate invitation link
  const baseUrl = config.app?.frontend_url || 'https://app.asonai.com';
  const invitationLink = `${baseUrl}/accept-invite/${token}`;

  // Prepare email data
  const templateData = {
    inviterName,
    tenantName,
    invitationLink,
    role,
    expiryDays,
  };

  const htmlContent = generateInvitationEmailHTML(templateData);
  const textContent = generateInvitationEmailText(templateData);
  const subject = getInvitationEmailSubject(tenantName, inviterName);

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: email,
    text: textContent,
  };

  // Retry configuration
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `Sending invitation email to ${email} (attempt ${attempt}/${maxRetries})`
      );

      const result = await sendMailWithNodeMailer(mailData);

      logger.info(`Invitation email sent successfully to ${email}`, {
        messageId: result.messageId,
        email,
        tenantName,
        role,
        attempt,
      });

      return {
        success: true,
        messageId: result.messageId,
        email,
        attempt,
      };
    } catch (error) {
      lastError = error;
      logger.error(
        `Failed to send invitation email (attempt ${attempt}/${maxRetries})`,
        {
          error: error.message,
          email,
          tenantName,
          attempt,
        }
      );

      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * attempt)
        );
      }
    }
  }

  // All retries failed
  logger.error(`All attempts to send invitation email failed`, {
    email,
    tenantName,
    error: lastError.message,
  });

  throw new Error(
    `Failed to send invitation email after ${maxRetries} attempts: ${lastError.message}`
  );
};

/**
 * Send invitation reminder email (for expiring invitations)
 * @param {Object} invitationData - Invitation data
 * @returns {Promise<Object>} Email send result
 */
export const sendInvitationReminderEmail = async (invitationData) => {
  // Similar to sendInvitationEmail but with reminder subject
  const {
    email,
    inviterName,
    tenantName,
    token,
    role = 'member',
    expiryDays = 7,
  } = invitationData;

  const baseUrl = config.app?.frontend_url || 'https://app.asonai.com';
  const invitationLink = `${baseUrl}/invite/${token}`;

  const templateData = {
    inviterName,
    tenantName,
    invitationLink,
    role,
    expiryDays,
  };

  const htmlContent = generateInvitationEmailHTML(templateData);
  const subject = `Reminder: Your invitation to ${tenantName} expires soon`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: email,
  };

  try {
    const result = await sendMailWithNodeMailer(mailData);
    logger.info(`Reminder email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error(`Failed to send reminder email to ${email}:`, error);
    throw error;
  }
};

/**
 * Validate email address format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default {
  sendInvitationEmail,
  sendInvitationReminderEmail,
  isValidEmail,
  checkEmailRateLimit,
};
