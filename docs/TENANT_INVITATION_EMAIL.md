# Tenant Invitation Email System

## Overview

The tenant invitation email system provides a robust, production-ready solution for sending invitation emails to new team members. It includes HTML/plain text templates, retry logic, rate limiting, and comprehensive error handling.

## Architecture

### Components

1. **Email Templates** (`src/app/modules/tenant/templates/invitationEmail.js`)

   - HTML email template with responsive design
   - Plain text fallback for email clients without HTML support
   - Dynamic template variables

2. **Email Service** (`src/app/modules/tenant/tenantInvitation.email.js`)

   - Mailgun integration
   - Retry logic with exponential backoff
   - Rate limiting (5 emails per hour per address)
   - Email validation

3. **Invitation Service** (`src/app/modules/tenant/tenantInvitation.service.js`)
   - Creates invitations
   - Integrates email sending
   - Handles email failures gracefully

## Features

### 1. Dual Format Support

Emails are sent in both HTML and plain text formats:

- **HTML**: Modern, responsive design with branding
- **Plain Text**: Fallback for email clients without HTML support

### 2. Retry Logic

Failed email sends are automatically retried:

- **Max Retries**: 3 attempts
- **Retry Delay**: Exponential backoff (1s, 2s, 3s)
- **Error Handling**: Logs failures and marks invitation status

```javascript
// Retry configuration
const maxRetries = 3;
const retryDelay = 1000; // 1 second base delay
```

### 3. Rate Limiting

Prevents email spam and abuse:

- **Limit**: 5 emails per hour per email address
- **Window**: 1 hour rolling window
- **Cleanup**: Automatic cleanup of old rate limit entries

```javascript
// Rate limiting settings
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_EMAILS_PER_HOUR = 5;
```

### 4. Template Variables

Dynamic email content based on invitation data:

| Variable         | Description                   | Example                                |
| ---------------- | ----------------------------- | -------------------------------------- |
| `inviterName`    | Name of person sending invite | "John Doe"                             |
| `tenantName`     | Workspace/tenant name         | "Acme Corp"                            |
| `invitationLink` | Unique acceptance link        | "https://app.altihq.com/invite/abc123" |
| `role`           | Assigned role                 | "admin" or "member"                    |
| `expiryDays`     | Days until expiry             | 7                                      |

## Usage

### Sending Invitation Email

```javascript
import { sendInvitationEmail } from './tenantInvitation.email.js';

try {
  const result = await sendInvitationEmail({
    email: 'user@example.com',
    inviterName: 'John Doe',
    tenantName: 'Acme Corp',
    token: 'unique-token-123',
    role: 'member',
    expiryDays: 7,
  });

  console.log('Email sent:', result.messageId);
} catch (error) {
  console.error('Failed to send email:', error.message);
}
```

### Email Template Customization

To customize the email template, edit:

- HTML: `generateInvitationEmailHTML()` in `templates/invitationEmail.js`
- Plain text: `generateInvitationEmailText()` in `templates/invitationEmail.js`

```javascript
// HTML template structure
export const generateInvitationEmailHTML = ({
  inviterName,
  tenantName,
  invitationLink,
  role,
  expiryDays,
}) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Custom styles */
  </style>
</head>
<body>
  <!-- Email content -->
</body>
</html>
  `;
};
```

## Error Handling

### Email Send Failures

When an email fails to send after all retries:

1. **Invitation Still Created**: The invitation record is created successfully
2. **Status Updated**: Invitation status set to `pending_email`
3. **Manual Resend**: Can be resent via `resendInvitation()` endpoint
4. **Logging**: Error logged with full context

```javascript
// Error handling in createInvitation
try {
  await sendInvitationEmail({ ... });
} catch (emailError) {
  logger.error('Failed to send invitation email', emailError);
  invitation.status = 'pending_email';
  await invitation.save();
  // Invitation creation continues
}
```

### Rate Limit Exceeded

When rate limit is exceeded:

```javascript
// Error thrown
throw new Error('Rate limit exceeded. Please try again later.');
```

Response:

```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again later.",
  "statusCode": 429
}
```

## Invitation Statuses

| Status          | Description                         | Email Sent?         |
| --------------- | ----------------------------------- | ------------------- |
| `pending`       | Invitation created and email sent   | ✅ Yes              |
| `pending_email` | Invitation created but email failed | ❌ No               |
| `accepted`      | User accepted invitation            | ✅ Yes (originally) |
| `expired`       | Invitation past expiry date         | ✅ Yes (originally) |
| `cancelled`     | Invitation cancelled by admin       | ✅ Yes (originally) |

## Email Service Configuration

### Mailgun Setup

Required environment variables in `config/index.js`:

```javascript
mailgun: {
  mailgun_api_key: process.env.MAILGUN_API_KEY,
  mailgun_domain: process.env.MAILGUN_DOMAIN,
  mailgun_from: process.env.MAILGUN_FROM || 'noreply@altihq.com'
}
```

### Frontend URL Configuration

Set the frontend URL for invitation links:

```javascript
app: {
  frontend_url: process.env.FRONTEND_URL || 'https://app.altihq.com';
}
```

## Testing

### Manual Testing

1. **Create Invitation**:

```bash
POST /api/v1/tenants/:tenantId/invitations
{
  "email": "test@example.com",
  "role": "member"
}
```

2. **Check Email**: Verify email received with correct formatting

3. **Test Link**: Click invitation link to verify it works

4. **Resend Email**:

```bash
POST /api/v1/tenants/invitations/:invitationId/resend
```

### Rate Limit Testing

Send 6+ emails to the same address within an hour:

```javascript
// Should succeed for first 5
for (let i = 0; i < 5; i++) {
  await sendInvitationEmail({ email: 'test@example.com', ... });
}

// Should fail with rate limit error
await sendInvitationEmail({ email: 'test@example.com', ... });
// Error: Rate limit exceeded
```

### Retry Logic Testing

Temporarily break Mailgun connection to test retries:

```javascript
// Monitor logs for retry attempts
// Should see: "Sending invitation email (attempt 1/3)"
// Should see: "Sending invitation email (attempt 2/3)"
// Should see: "Sending invitation email (attempt 3/3)"
```

## Email Template Best Practices

### HTML Email Guidelines

1. **Inline Styles**: Use inline CSS for maximum compatibility
2. **Table Layouts**: Use tables for layout structure
3. **Alt Text**: Include alt text for images
4. **Mobile Responsive**: Test on mobile devices
5. **Plain Text**: Always include plain text version

### Subject Line Best Practices

- Keep under 50 characters
- Include workspace name
- Make action clear
- Avoid spam trigger words

Current subject format:

```
You've been invited to join [Workspace] by [Person]
```

## Monitoring and Logs

### Success Logs

```
INFO: Invitation email sent successfully to user@example.com
INFO: {
  messageId: "msg-123",
  email: "user@example.com",
  tenantName: "Acme Corp",
  role: "member",
  attempt: 1
}
```

### Error Logs

```
ERROR: Failed to send invitation email (attempt 3/3)
ERROR: {
  error: "Connection timeout",
  email: "user@example.com",
  tenantName: "Acme Corp",
  attempt: 3
}
```

## Security Considerations

### Token Security

- **Unique Tokens**: Each invitation has a unique token
- **Expiry**: Tokens expire after 7 days
- **Single Use**: Token becomes invalid after acceptance

### Rate Limiting

- **Per-Email Limit**: Prevents spam to individual addresses
- **Rolling Window**: 1-hour rolling window for fairness
- **Cleanup**: Automatic cleanup prevents memory leaks

### Email Validation

```javascript
import { isValidEmail } from './tenantInvitation.email.js';

if (!isValidEmail(email)) {
  throw new Error('Invalid email address');
}
```

## Troubleshooting

### Email Not Received

1. **Check Spam Folder**: Email may be filtered as spam
2. **Verify Mailgun**: Check Mailgun dashboard for delivery status
3. **Check Logs**: Review server logs for send attempts
4. **Resend**: Use resend endpoint if email failed

### Rate Limit Issues

1. **Check Rate**: Verify 5+ emails weren't sent to address in past hour
2. **Wait**: Wait for rate limit window to expire
3. **Clear Cache**: Restart server to clear rate limit cache (dev only)

### Template Not Rendering

1. **HTML Fallback**: Check if plain text version works
2. **Email Client**: Test in different email clients
3. **Inline Styles**: Ensure all styles are inline
4. **Validate HTML**: Check for malformed HTML

## Future Enhancements

### Planned Features

- [ ] **Template Customization**: Per-tenant email branding
- [ ] **Email Analytics**: Track open rates and click rates
- [ ] **Reminder Emails**: Send reminders before expiry
- [ ] **Localization**: Multi-language email templates
- [ ] **Rich Text Editor**: Admin UI for template editing
- [ ] **A/B Testing**: Test different email variations
- [ ] **Email Preferences**: User opt-out management

### Performance Optimizations

- [ ] **Queue System**: Use Redis queue for email sending
- [ ] **Batch Processing**: Send multiple emails in batches
- [ ] **CDN Images**: Host images on CDN for faster loading
- [ ] **Database Caching**: Cache tenant/user data for templates

## API Reference

### sendInvitationEmail(invitationData)

Sends an invitation email with retry logic and rate limiting.

**Parameters:**

- `invitationData.email` (string, required): Recipient email address
- `invitationData.inviterName` (string, required): Name of inviter
- `invitationData.tenantName` (string, required): Workspace name
- `invitationData.token` (string, required): Unique invitation token
- `invitationData.role` (string, optional): Role (default: "member")
- `invitationData.expiryDays` (number, optional): Days until expiry (default: 7)

**Returns:** `Promise<Object>`

```javascript
{
  success: true,
  messageId: "msg-123",
  email: "user@example.com",
  attempt: 1
}
```

**Throws:** `Error` - If all retry attempts fail or rate limit exceeded

### checkEmailRateLimit(email)

Checks if an email address has exceeded the rate limit.

**Parameters:**

- `email` (string, required): Email address to check

**Returns:** `boolean` - True if email can be sent, false if rate limited

### isValidEmail(email)

Validates email address format.

**Parameters:**

- `email` (string, required): Email address to validate

**Returns:** `boolean` - True if valid email format

## Related Documentation

- [Tenant Implementation Guide](TENANT_IMPLEMENTATION_CORE.md)
- [Tenant API Reference](TENANT_API.md)
- [Email Service Configuration](../config/README.md)
- [Mailgun Integration](MAILGUN_INTEGRATION.md)

## Support

For issues or questions about the email system:

1. **Check Logs**: Review application logs for errors
2. **Mailgun Dashboard**: Check Mailgun for delivery status
3. **Documentation**: Review this guide thoroughly
4. **Team Contact**: Reach out to backend team for assistance

---

**Last Updated**: December 2024  
**Version**: 1.0.0  
**Maintainer**: Backend Team
