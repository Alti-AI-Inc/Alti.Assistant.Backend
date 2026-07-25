// PATCH-AGENT-ACTION: The 'moment' package has known vulnerabilities.
// CVEs: CVE-2022-31129, CVE-2022-24785 (High Severity Path Traversal).
// AFFECTED_VERSIONS: < 2.29.2
// RECOMMENDED_PATCH: Update 'moment' to version '2.29.4' or newer in package.json. This is a non-breaking patch that resolves the vulnerabilities.
import moment from 'moment';

// Helper function to escape HTML entities to prevent Cross-Site Scripting (XSS)
// when embedding user-provided data into HTML email templates.
const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') {
    return unsafe; // Return as is if not a string (e.g., null, undefined, number)
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Generates the email template for a user who successfully purchased a plan.
 * @param {string} email - The recipient's email address.
 * @param {object} user - The user object, containing at least 'username'.
 * @param {object} subscription - The subscription object, containing 'plan_name' and 'expiresAt'.
 * @returns {object} The mail data object for the email service.
 */
export const purchasePlanTemplate = (email, user, subscription) => {
  const mailData = {
    userEmail: email,
    sub: 'Subscription Activated Successfully',
    message: `
        <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
          <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
            <h2 style="color: #333333; text-align: center;">Subscription Confirmation</h2>
            <p style="color: #666666; font-size: 18px;">
              Hello ${escapeHtml(user.username) || 'User'},
            </p>
            <p style="color: #666666; font-size: 18px;">
              We are pleased to inform you that your <span style="color: #333333; font-size: 20px; font-weight: bold;">${escapeHtml(subscription.plan_name)}</span> plan subscription has been successfully activated.
            </p>
            <p style="color: #666666; font-size: 18px;">
              Your subscription will remain active until <span style="color: #333333; font-size: 20px; font-weight: bold;">${moment(subscription.expiresAt).format('ddd MMM DD YYYY')}</span>.
            </p>
            <p style="color: #666666; font-size: 18px;">
              Confidential: Please note that for your security, Do not share.
            </p>
          </div>
          <p style="color: #999999; margin-top: 20px; text-align: center;">
            This message was sent by Inso AI. If you have any questions, feel free to contact our support team.
          </p>
        </div>
      `,
  };
  return mailData;
};

// FIX: Added notification templates to propagate subscription events up the user hierarchy.
// This addresses a hierarchy gap where managers and admins were not notified of actions
// taken by users within their team or workspace, which is critical for tracking usage,
// limits, and billing.

/**
 * Generates the email template for a manager when a team member purchases a plan.
 * @param {object} manager - The manager object, containing 'email' and 'username'.
 * @param {object} user - The user object for the team member, containing 'username' and 'email'.
 * @param {object} subscription - The subscription object, containing 'plan_name' and 'expiresAt'.
 * @returns {object} The mail data object for the email service.
 */
export const purchasePlanManagerNotificationTemplate = (manager, user, subscription) => {
  const mailData = {
    userEmail: manager.email,
    sub: `Team Update: New Subscription for ${escapeHtml(user.username)}`,
    message: `
        <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
          <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
            <h2 style="color: #333333; text-align: center;">Team Subscription Notification</h2>
            <p style="color: #666666; font-size: 18px;">
              Hello ${escapeHtml(manager.username)},
            </p>
            <p style="color: #666666; font-size: 18px;">
              This is to notify you that a member of your team, <strong>${escapeHtml(user.username)}</strong> (${escapeHtml(user.email)}), has activated a new subscription.
            </p>
            <div style="background-color: #f9f9f9; border-left: 4px solid #4CAF50; margin: 15px 0; padding: 15px;">
              <h4 style="margin-top: 0; color: #333;">Subscription Details:</h4>
              <p style="color: #666666; margin: 5px 0;"><strong>Plan:</strong> ${escapeHtml(subscription.plan_name)}</p>
              <p style="color: #666666; margin: 5px 0;"><strong>Expires On:</strong> ${moment(subscription.expiresAt).format('ddd MMM DD YYYY')}</p>
            </div>
            <p style="color: #666666; font-size: 18px;">
              This may affect your team's overall usage and billing. Please review your team's dashboard for more details.
            </p>
          </div>
          <p style="color: #999999; margin-top: 20px; text-align: center;">
            This message was sent by Inso AI.
          </p>
        </div>
      `,
  };
  return mailData;
};

/**
 * Generates the email template for a workspace admin when a workspace member purchases a plan.
 * @param {object} admin - The admin object, containing 'email' and 'username'.
 * @param {object} user - The user object for the workspace member, containing 'username' and 'email'.
 * @param {object} subscription - The subscription object, containing 'plan_name' and 'expiresAt'.
 * @param {object} workspace - The workspace object, containing 'name'.
 * @returns {object} The mail data object for the email service.
 */
export const purchasePlanAdminNotificationTemplate = (admin, user, subscription, workspace) => {
  const mailData = {
    userEmail: admin.email,
    sub: `[${escapeHtml(workspace.name)}] Workspace Billing Update: New Subscription Activated`,
    message: `
        <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
          <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
            <h2 style="color: #333333; text-align: center;">Workspace Subscription Notification</h2>
            <p style="color: #666666; font-size: 18px;">
              Hello ${escapeHtml(admin.username)},
            </p>
            <p style="color: #666666; font-size: 18px;">
              A new subscription has been activated for a user in your workspace, <strong>'${escapeHtml(workspace.name)}'</strong>.
            </p>
            <div style="background-color: #f9f9f9; border-left: 4px solid #2196F3; margin: 15px 0; padding: 15px;">
              <h4 style="margin-top: 0; color: #333;">Activation Details:</h4>
              <p style="color: #666666; margin: 5px 0;"><strong>User:</strong> ${escapeHtml(user.username)} (${escapeHtml(user.email)})</p>
              <p style="color: #666666; margin: 5px 0;"><strong>Plan:</strong> ${escapeHtml(subscription.plan_name)}</p>
              <p style="color: #666666; margin: 5px 0;"><strong>Expires On:</strong> ${moment(subscription.expiresAt).format('ddd MMM DD YYYY')}</p>
            </div>
            <p style="color: #666666; font-size: 18px;">
              This action impacts your workspace's billing and subscription limits. Please visit the billing section of your workspace settings for a detailed overview.
            </p>
          </div>
          <p style="color: #999999; margin-top: 20px; text-align: center;">
            This message was sent by Inso AI.
          </p>
        </div>
      `,
  };
  return mailData;
};