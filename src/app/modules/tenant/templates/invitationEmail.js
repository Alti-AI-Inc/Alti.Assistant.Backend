/**
 * Tenant Invitation Email Template
 * Generates HTML and plain text versions of invitation emails
 */

/**
 * Helper function to HTML-escape a string to prevent XSS.
 * @param {string} text - The string to escape.
 * @returns {string} The HTML-escaped string.
 */
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
};

/**
 * Helper function to sanitize a URL for use in an HTML href attribute.
 * Prevents 'javascript:' and other malicious schemes.
 * @param {string} url - The URL to sanitize.
 * @returns {string} The sanitized and HTML-escaped URL, or '#' if invalid.
 */
const sanitizeUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    // Only allow http and https protocols
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return escapeHtml(url); // HTML-escape the valid URL
    }
  } catch (e) {
    // URL parsing failed, likely an invalid URL
  }
  // Fallback to a safe, non-functional link if the URL is invalid or uses a disallowed protocol
  return '#';
};

/**
 * Generate HTML email template for tenant invitation
 * @param {Object} data - Email template data
 * @param {string} data.inviterName - Name of person sending the invitation
 * @param {string} data.tenantName - Name of the tenant/workspace
 * @param {string} data.invitationLink - Full URL with invitation token
 * @param {string} data.role - Role being offered (admin/manager/member)
 * @param {number} [data.expiryDays=7] - Days until invitation expires. Defaults to 7.
 * @returns {string} HTML email template
 */
export const generateInvitationEmailHTML = (data) => {
  const {
    inviterName,
    tenantName,
    invitationLink,
    role,
    expiryDays = 7,
  } = data;

  // HTML-escape all user-provided data to prevent XSS vulnerabilities
  const escapedInviterName = escapeHtml(inviterName);
  const escapedTenantName = escapeHtml(tenantName);
  const sanitizedInvitationLink = sanitizeUrl(invitationLink);
  const escapedInvitationLinkText = escapeHtml(invitationLink); // For displaying the link as text
  const escapedRole = escapeHtml(role);
  const escapedExpiryDays = escapeHtml(String(expiryDays)); // Ensure expiryDays is treated as string for escaping

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${escapedTenantName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content p {
      margin: 0 0 20px;
      font-size: 16px;
      color: #555;
    }
    .highlight {
      background-color: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .highlight strong {
      color: #667eea;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      margin: 25px 0;
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .expiry-notice {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px 15px;
      margin: 20px 0;
      font-size: 14px;
      color: #856404;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
      border-top: 1px solid #e9ecef;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .link-fallback {
      font-size: 14px;
      color: #6c757d;
      word-break: break-all;
      margin-top: 15px;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 20px;
        border-radius: 4px;
      }
      .header, .content, .footer {
        padding: 25px 20px;
      }
      .cta-button {
        display: block;
        padding: 14px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🎉 You're Invited!</h1>
    </div>
    
    <div class="content">
      <p>Hello,</p>
      
      <p><strong>${escapedInviterName}</strong> has invited you to join <strong>${escapedTenantName}</strong> workspace as a <strong>${escapedRole}</strong>.</p>
      
      <div class="highlight">
        <p><strong>What's a workspace?</strong></p>
        <p>A workspace allows you to collaborate with your team, share resources, and manage projects together in one place.</p>
      </div>
      
      <p>By accepting this invitation, you'll get access to:</p>
      <ul>
        <li>✨ Collaborative workspace features</li>
        <li>📊 Shared resources and data</li>
        <li>👥 Team collaboration tools</li>
        <li>🔐 ${escapedRole === 'admin' ? 'Full administrative access' : escapedRole === 'manager' ? 'Manager access to team and workspace features' : 'Member access to team features'}</li>
      </ul>
      
      <div class="button-container">
        <a href="${sanitizedInvitationLink}" class="cta-button">Accept Invitation</a>
      </div>
      
      <div class="expiry-notice">
        ⏰ <strong>Important:</strong> This invitation will expire in ${escapedExpiryDays} days. Please accept it before it expires.
      </div>
      
      <p class="link-fallback">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${sanitizedInvitationLink}">${escapedInvitationLinkText}</a>
      </p>
      
      <p style="margin-top: 30px; font-size: 14px; color: #6c757d;">
        If you didn't expect this invitation or believe it was sent by mistake, you can safely ignore this email.
      </p>
    </div>
    
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@altihq.com">support@altihq.com</a></p>
      <p style="margin-top: 10px;">
        © ${new Date().getFullYear()} Alti AI. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Generate plain text email template for tenant invitation
 * @param {Object} data - Email template data
 * @param {string} data.inviterName - Name of person sending the invitation
 * @param {string} data.tenantName - Name of the tenant/workspace
 * @param {string} data.invitationLink - Full URL with invitation token
 * @param {string} data.role - Role being offered (admin/manager/member)
 * @param {number} [data.expiryDays=7] - Days until invitation expires. Defaults to 7.
 * @returns {string} Plain text email template
 */
export const generateInvitationEmailText = (data) => {
  const {
    inviterName,
    tenantName,
    invitationLink,
    role,
    expiryDays = 7,
  } = data;

  return `
You're Invited to ${tenantName}!

Hello,

${inviterName} has invited you to join ${tenantName} workspace as a ${role}.

What's a workspace?
A workspace allows you to collaborate with your team, share resources, and manage projects together in one place.

By accepting this invitation, you'll get access to:
- Collaborative workspace features
- Shared resources and data
- Team collaboration tools
- ${role === 'admin' ? 'Full administrative access' : role === 'manager' ? 'Manager access to team and workspace features' : 'Member access to team features'}

Accept Invitation:
${invitationLink}

IMPORTANT: This invitation will expire in ${expiryDays} days. Please accept it before it expires.

If you didn't expect this invitation or believe it was sent by mistake, you can safely ignore this email.

Need help? Contact us at support@altihq.com

© ${new Date().getFullYear()} Alti AI. All rights reserved.
  `.trim();
};

/**
 * Get email subject for invitation
 * @param {string} tenantName - Name of the tenant
 * @param {string} inviterName - Name of person sending invite
 * @returns {string} Email subject
 */
export const getInvitationEmailSubject = (tenantName, inviterName) => {
  return `You've been invited to join ${tenantName} by ${inviterName}`;
};