/**
 * @file Authentication utility functions for the Alti.Assistant backend.
 * @module app/modules/auth/auth.utils
 * @description This file contains helper functions for authentication-related tasks,
 * including OTP generation, HTML email template creation for various user actions
 * (registration, password reset, account deletion, team invites), and permission checking.
 * It also includes a utility for escaping HTML to prevent XSS vulnerabilities in email templates.
 */
import crypto from 'crypto';
import config from '../../../../config/index.js';

/**
 * Escapes HTML special characters to prevent HTML injection / XSS.
 *
 * @param {string} unsafe - The unsafe string to escape.
 * @returns {string} The escaped safe string.
 */
const escapeHtml = (unsafe) => {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Generates a 6-digit numeric One-Time Password (OTP).
 * Uses cryptographically secure random number generation.
 *
 * @async
 * @returns {Promise<string>} A promise that resolves to the generated 6-digit OTP.
 */
export const generateOTP = async () => {
  // Using Node's built-in crypto module for cryptographically secure OTP generation.
  const otp = crypto.randomInt(100000, 1000000).toString();
  return otp;
};

/**
 * Creates an HTML email template for user registration verification.
 * This template includes a verification code (OTP) and a direct verification link.
 *
 * @param {string} email - The email address of the user to whom the email will be sent.
 * @param {string} token - The 6-digit verification token (OTP) to be included in the email.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const registrationOtpTemplate = (email, token) => {
  // BUG FIX: Add input validation for the recipient email address to prevent downstream errors.
  if (!email || typeof email !== 'string') {
    throw new Error(
      'A valid email string is required for registrationOtpTemplate.',
    );
  }
  const frontendUrl = config.client_url || 'https://altiassistant.com';
  const verificationLink = `${frontendUrl}/register?code=${encodeURIComponent(token)}`;

  const mailData = {
    userEmail: email,
    sub: 'Verify Your Account',
    message: `<div style=" font-family: 'Arial', sans-serif; padding: 20px; background-color: #f4f4f4;  margin: auto; width: 60%;">
                <div style="max-width: 1050px;  background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
                  <h2 style="color: #333333; text-align: center;">Email Verification</h2>
                  <p style="color: #666666; font-size: 18px;">Dear user,</p>
                  <p style="color: #666666; font-size: 18px;">Thank you for signing up on Alti AI! To complete your registration, please enter the following 6-digit verification code on the registration page:</p>
                  <div style="font-size: 32px; font-weight: bold; color: #242C36; text-align: center; letter-spacing: 5px; margin: 20px 0; background-color: #F5F5F7; padding: 15px; border-radius: 8px; border: 1px solid #E5E5E7;">
                    ${escapeHtml(token)}
                  </div>
                  <p style="color: #666666; font-size: 18px;">Or click the button below to verify your email automatically:</p>
                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${escapeHtml(verificationLink)}" 
                       style="display: inline-block; background-color: #242C36; color: #FFFFFF; border: none; border-radius: 8px; padding: 12px 24px; text-decoration: none; font-size: 18px; font-weight: bold;">
                      Verify Account
                    </a>
                  </div>
                  <p style="color: #666666; font-size: 18px;">If you didn't sign up for our service, you can ignore this email.</p>
                </div>
                <p style="color: #999999; margin-top: 20px;">This email was sent by Alti AI.</p>
              </div>`,
  };
  return mailData;
};

/**
 * Creates an HTML email template for forgotten password OTP verification.
 * This template provides the user with a One-Time Password to reset their password.
 *
 * @param {string} email - The email address of the user to whom the email will be sent.
 * @param {object} user - The user object, expected to contain at least a `username` property.
 * @param {string} [user.username] - The username of the user.
 * @param {string} OTP - The One-Time Password to be included in the email for password reset.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const forgetPassOtpTemplate = (email, user, OTP) => {
  // BUG FIX: Add input validation for the recipient email address to prevent downstream errors.
  if (!email || typeof email !== 'string') {
    throw new Error('A valid email string is required for forgetPassOtpTemplate.');
  }
  const mailData = {
    userEmail: email,
    sub: 'Verify Your One-Time Password (OTP)',
    message: `
      <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
        <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
          <h2 style="color: #333333; text-align: center;">Verify Your OTP</h2>
          <p style="color: #666666; font-size: 18px;">
            Dear ${escapeHtml(user?.username || 'User')},
          </p>
          <p style="color: #666666; font-size: 18px;">
            To complete your reset password, please enter the following OTP: <span style="color: #333333; font-size: 20px; font-weight: bold; text-align: center;">
            ${escapeHtml(OTP)}
            </span>
          </p>
          <p style="color: #666666; font-size: 18px;">
            This code is valid for 10 minutes. Please do not share it with anyone for your security.
          </p>
        </div>
        <p style="color: #999999; margin-top: 20px; text-align: center;">
          This email was sent by Alti AI.
        </p>
      </div>
    `,
  };
  return mailData;
};

/**
 * Creates an HTML email template for account deletion OTP verification.
 * This template provides the user with a One-Time Password to confirm their account deletion request.
 * This function is called within an authenticated context, for the user requesting to delete their own account.
 *
 * @param {object} user - The authenticated user object, expected to contain `email` and `username` properties.
 * @param {string} user.email - The email address of the user.
 * @param {string} [user.username] - The username of the user.
 * @param {string} OTP - The One-Time Password to be included in the email for account deletion confirmation.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const deleteUserOtpTemplate = (user, OTP) => {
  // BUG FIX: Add input validation to ensure a valid user object with an email is provided.
  // This prevents runtime errors in the email sending service if the user object is malformed or null.
  if (!user || !user.email) {
    throw new Error(
      'A valid user object with an email property is required for deleteUserOtpTemplate.',
    );
  }
  const mailData = {
    userEmail: user.email,
    sub: 'Delete Account OTP',
    message: `
      <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
        <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
          <h2 style="color: #333333; text-align: center;">Verify Your OTP</h2>
          <p style="color: #666666; font-size: 18px;">
            Dear ${escapeHtml(user?.username || 'User')},
          </p>
          <p style="color: #666666; font-size: 18px;">
            To proceed with deleting your account, please enter the following OTP:
            <span style="color: #333333; font-size: 20px; font-weight: bold; text-align: center;">${escapeHtml(OTP)}</span>
          </p>
          <p style="color: #666666; font-size: 18px;">
            This code is valid for 10 minutes. Please do not share it with anyone for your security.
          </p>
        </div>
        <p style="color: #999999; margin-top: 20px; text-align: center;">
          This email was sent by Alti AI.
        </p>
      </div>
    `,
  };
  return mailData;
};

/**
 * Creates an HTML email template for inviting a new member to a workspace.
 * This is initiated by an authenticated user with 'manager' or 'admin' privileges within a workspace.
 *
 * @param {string} inviterName - The name of the user sending the invitation.
 * @param {string} inviteeEmail - The email address of the person being invited.
 * @param {string} workspaceName - The name of the workspace they are invited to.
 * @param {string} invitationToken - The unique token for the invitation link.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const teamInvitationTemplate = (
  inviterName,
  inviteeEmail,
  workspaceName,
  invitationToken,
) => {
  // BUG FIX: Add input validation for the recipient email address to prevent downstream errors.
  if (!inviteeEmail || typeof inviteeEmail !== 'string') {
    throw new Error(
      'A valid inviteeEmail string is required for teamInvitationTemplate.',
    );
  }
  const frontendUrl = config.client_url || 'https://altiassistant.com';
  const invitationLink = `${frontendUrl}/accept-invitation?token=${encodeURIComponent(invitationToken)}`;

  const mailData = {
    userEmail: inviteeEmail,
    sub: `You're invited to join ${escapeHtml(workspaceName)} on Alti AI`,
    message: `<div style="font-family: 'Arial', sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 60%;">
                <div style="max-width: 1050px; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
                  <h2 style="color: #333333; text-align: center;">You're Invited!</h2>
                  <p style="color: #666666; font-size: 18px;">Hello,</p>
                  <p style="color: #666666; font-size: 18px;">
                    <b>${escapeHtml(inviterName)}</b> has invited you to join the <b>${escapeHtml(workspaceName)}</b> workspace on Alti AI.
                  </p>
                  <p style="color: #666666; font-size: 18px;">Click the button below to accept the invitation and set up your account.</p>
                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${escapeHtml(invitationLink)}" 
                       style="display: inline-block; background-color: #242C36; color: #FFFFFF; border: none; border-radius: 8px; padding: 12px 24px; text-decoration: none; font-size: 18px; font-weight: bold;">
                      Accept Invitation
                    </a>
                  </div>
                  <p style="color: #666666; font-size: 18px;">If you were not expecting this invitation, you can safely ignore this email.</p>
                </div>
                <p style="color: #999999; margin-top: 20px; text-align: center;">This email was sent by Alti AI.</p>
              </div>`,
  };
  return mailData;
};

/**
 * Creates an HTML email template to notify a user of a role change within a workspace.
 * This action is performed by an authenticated user with 'manager' or 'admin' privileges.
 *
 * @param {object} user - The user object of the person whose role is being changed.
 * @param {string} user.email - The email address of the user.
 * @param {string} [user.username] - The username of the user.
 * @param {string} managerName - The name of the manager who updated the role.
 * @param {string} workspaceName - The name of the workspace where the role was updated.
 * @param {string} newRole - The user's new role (e.g., 'Manager', 'Member').
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const roleUpdateNotificationTemplate = (
  user,
  managerName,
  workspaceName,
  newRole,
) => {
  // BUG FIX: Add input validation to ensure a valid user object with an email is provided.
  // This prevents runtime errors in the email sending service if the user object is malformed or null.
  if (!user || !user.email) {
    throw new Error(
      'A valid user object with an email property is required for roleUpdateNotificationTemplate.',
    );
  }
  const frontendUrl = config.client_url || 'https://altiassistant.com';
  const dashboardLink = `${frontendUrl}/dashboard`;

  const mailData = {
    userEmail: user.email,
    sub: `Your role in ${escapeHtml(workspaceName)} has been updated`,
    message: `<div style="font-family: 'Arial', sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 60%;">
                <div style="max-width: 1050px; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
                  <h2 style="color: #333333; text-align: center;">Role Updated</h2>
                  <p style="color: #666666; font-size: 18px;">
                    Dear ${escapeHtml(user?.username || 'User')},
                  </p>
                  <p style="color: #666666; font-size: 18px;">
                    Your role in the <b>${escapeHtml(workspaceName)}</b> workspace has been updated by <b>${escapeHtml(managerName)}</b>.
                  </p>
                  <p style="color: #666666; font-size: 18px;">
                    Your new role is: <b style="color: #242C36;">${escapeHtml(newRole)}</b>.
                  </p>
                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${escapeHtml(dashboardLink)}" 
                       style="display: inline-block; background-color: #242C36; color: #FFFFFF; border: none; border-radius: 8px; padding: 12px 24px; text-decoration: none; font-size: 18px; font-weight: bold;">
                      Go to Dashboard
                    </a>
                  </div>
                  <p style="color: #666666; font-size: 18px;">If you have any questions, please contact your workspace manager.</p>
                </div>
                <p style="color: #999999; margin-top: 20px; text-align: center;">This email was sent by Alti AI.</p>
              </div>`,
  };
  return mailData;
};

/**
 * Checks if a user has the required permission to perform an action.
 * This is a crucial utility for enforcing role-based access control (RBAC) throughout the application.
 * Super Admins and Admins are granted universal access and bypass specific permission checks.
 * For other roles, it verifies if the specific permission string is present in the user's permission list.
 *
 * @param {object} userContext - The user's context object, typically derived from a JWT.
 * @param {string} userContext.role - The role of the user (e.g., 'super_admin', 'admin', 'manager', 'member').
 * @param {string[]} [userContext.permissions] - An array of permission strings assigned to the user.
 * @param {string} permission - The specific permission string required for the action (e.g., 'manage_billing', 'delete_user').
 * @throws {Error} Throws an "Authentication required." error if the user context is missing.
 * @throws {Error} Throws a "Forbidden: Insufficient permissions..." error if the user lacks the required permission.
 * @returns {void} Does not return a value, but throws an error on failure.
 */
export const checkPermission = (userContext, permission) => {
  if (!userContext) {
    throw new Error('Authentication required.');
  }

  // Super Admins/Admins have universal access
  if (userContext.role === 'super_admin' || userContext.role === 'admin') {
    return;
  }

  // Check explicit permissions
  const permissions = userContext.permissions || [];
  if (permissions.includes(permission)) {
    return;
  }

  throw new Error(`Forbidden: Insufficient permissions for ${permission}`);
};