/**
 * Tenant Invitation Email Template
 * Generates HTML and plain text versions of invitation emails
 */

/**
 * Generate HTML email template for tenant invitation
 * @param {Object} data - Email template data
 * @param {string} data.inviterName - Name of person sending the invitation
 * @param {string} data.tenantName - Name of the tenant/workspace
 * @param {string} data.invitationLink - Full URL with invitation token
 * @param {string} data.role - Role being offered (admin/member)
 * @param {number} data.expiryDays - Days until invitation expires
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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${tenantName}</title>
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
      
      <p><strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> workspace as a <strong>${role}</strong>.</p>
      
      <div class="highlight">
        <p><strong>What's a workspace?</strong></p>
        <p>A workspace allows you to collaborate with your team, share resources, and manage projects together in one place.</p>
      </div>
      
      <p>By accepting this invitation, you'll get access to:</p>
      <ul>
        <li>✨ Collaborative workspace features</li>
        <li>📊 Shared resources and data</li>
        <li>👥 Team collaboration tools</li>
        <li>🔐 ${role === 'admin' ? 'Full administrative access' : 'Member access to team features'}</li>
      </ul>
      
      <div class="button-container">
        <a href="${invitationLink}" class="cta-button">Accept Invitation</a>
      </div>
      
      <div class="expiry-notice">
        ⏰ <strong>Important:</strong> This invitation will expire in ${expiryDays} days. Please accept it before it expires.
      </div>
      
      <p class="link-fallback">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${invitationLink}">${invitationLink}</a>
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
- ${role === 'admin' ? 'Full administrative access' : 'Member access to team features'}

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
