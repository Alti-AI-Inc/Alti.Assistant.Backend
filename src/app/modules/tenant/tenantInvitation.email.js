import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMail.js';
import {
  generateInvitationEmailHTML,
  generateInvitationEmailText,
  getInvitationEmailSubject,
} from './templates/invitationEmail.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

/**
 * @typedef {Object} InvitationData
 * @property {string} email - The recipient's email address.
 * @property {string} inviterName - The name of the user sending the invitation.
 * @property {string} tenantName - The name of the tenant/workspace being invited to.
 * @property {string} token - The unique invitation token.
 * @property {string} [role='user'] - The role assigned to the invited user (e.g., 'admin', 'member', 'user'). Defaults to 'user'.
 * @property {number} [expiryDays=7] - The number of days until the invitation token expires. Defaults to 7.
 */

/**
 * Email rate limiting cache.
 * Stores timestamps of sent emails for each recipient to prevent spam.
 * The key is the lowercase email address, and the value is an array of timestamps (Date.now()).
 * @type {Map<string, number[]>}
 */
const emailRateLimitCache = new Map();

/**
 * The time window (in milliseconds) for rate limiting.
 * Currently set to 1 hour (60 minutes * 60 seconds * 1000 milliseconds).
 * @type {number}
 */
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

/**
 * The maximum number of invitation emails allowed to be sent to a single email address
 * within the `RATE_LIMIT_WINDOW`.
 * @type {number}
 */
const MAX_EMAILS_PER_HOUR = 5; // Max 5 invitation emails per hour per email address

/**
 * Checks if an email can be sent to a given recipient based on the defined rate limits.
 * If the email can be sent, its timestamp is recorded in the cache.
 *
 * @param {string} email - The recipient's email address to check.
 * @returns {boolean} `true` if the email can be sent (within rate limits), `false` otherwise.
 */
const checkEmailRateLimit = (email) => {
  const now = Date.now();
  const key = email.toLowerCase();

  if (!emailRateLimitCache.has(key)) {
    emailRateLimitCache.set(key, [now]);
    return true;
  }

  const timestamps = emailRateLimitCache.get(key);
  // Remove timestamps older than the rate limit window
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
 * Periodically cleans up old entries from the `emailRateLimitCache`.
 * This prevents the cache from growing indefinitely and ensures only relevant
 * timestamps within the `RATE_LIMIT_WINDOW` are maintained.
 * Runs every `RATE_LIMIT_WINDOW` (1 hour).
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
 * Sends an invitation email to a new user with retry logic and rate limiting.
 * Constructs the email content using predefined templates and sends it via NodeMailer.
 *
 * @param {InvitationData} invitationData - An object containing all necessary data for the invitation email.
 * @returns {Promise<Object>} A promise that resolves to an object indicating the success of the email send,
 *   including `messageId`, `email`, and `attempt` if successful.
 * @throws {Error} If the email sending fails after all retries or if rate limits are exceeded.
 */
export const sendInvitationEmail = async (invitationData) => {
  const {
    email,
    inviterName,
    tenantName,
    token,
    role = 'user',
    expiryDays = 7,
  } = invitationData;

  // Check rate limiting
  if (!checkEmailRateLimit(email)) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  // Generate invitation link
  const baseUrl = config.app?.frontend_url || 'https://app.insoai.com';
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
 * Sends an invitation reminder email to a user whose invitation is expiring soon.
 * This function currently does not implement rate limiting or retry logic,
 * assuming it will be called for specific, less frequent events.
 *
 * @param {InvitationData} invitationData - An object containing all necessary data for the reminder email.
 * @returns {Promise<Object>} A promise that resolves to an object indicating the success of the email send,
 *   including `messageId` if successful.
 * @throws {Error} If the email sending fails.
 */
export const sendInvitationReminderEmail = async (invitationData) => {
  // Similar to sendInvitationEmail but with reminder subject
  const {
    email,
    inviterName,
    tenantName,
    token,
    role = 'user',
    expiryDays = 7,
  } = invitationData;

  const baseUrl = config.app?.frontend_url || 'https://app.insoai.com';
  // BUG FIX: Changed invitationLink path to '/accept-invite/' for consistency with initial invitation email.
  const invitationLink = `${baseUrl}/accept-invite/${token}`;

  const templateData = {
    inviterName,
    tenantName,
    invitationLink,
    role,
    expiryDays,
  };

  const htmlContent = generateInvitationEmailHTML(templateData);
  // BUG FIX: Added plain text content for better email client compatibility and accessibility.
  const textContent = generateInvitationEmailText(templateData);
  const subject = `Reminder: Your invitation to ${tenantName} expires soon`;

  const mailData = {
    sub: subject,
    message: htmlContent,
    userEmail: email,
    // BUG FIX: Included plain text content.
    text: textContent,
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
 * Validates the format of an email address using a regular expression.
 *
 * @param {string} email - The email address string to validate.
 * @returns {boolean} `true` if the email address matches the standard email format, `false` otherwise.
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Default export object containing all public utility functions for tenant invitation emails.
 * @type {Object}
 * @property {function(InvitationData): Promise<Object>} sendInvitationEmail - Function to send a new tenant invitation email.
 * @property {function(InvitationData): Promise<Object>} sendInvitationReminderEmail - Function to send an invitation reminder email.
 * @property {function(string): boolean} isValidEmail - Function to validate an email address format.
 */
export default {
  sendInvitationEmail,
  sendInvitationReminderEmail,
  isValidEmail,
  // BUG FIX: Removed checkEmailRateLimit from default export as it's an internal helper.
};