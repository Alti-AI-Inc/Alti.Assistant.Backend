# Tenant Module

Multi-tenant functionality for Alti AI Core Service.

## Overview

This module provides complete multi-tenancy support, allowing multiple organizations (tenants) to use the platform with data isolation and separate billing.

## Features

- **Tenant Management**: Create, update, and manage tenants/workspaces
- **Member Invitations**: Invite users via email with secure tokens
- **Role-Based Access**: Owner, Admin, and Member roles with permissions
- **Usage Tracking**: Track API calls, storage, and user counts per tenant
- **Plan Limits**: Enforce limits based on subscription plans
- **Email Notifications**: Automated invitation emails with branded templates

## Models

### Tenant Model

- **Fields**: name, slug, ownerId, status, plan, settings, limits, usage, subscription, metadata
- **Statuses**: active, suspended, trial, cancelled
- **Plans**: free, explore, analyze, execute, command, enterprise

### Tenant Invitation Model

- **Fields**: tenantId, email, role, invitedBy, token, status, expiresAt
- **Statuses**: pending, accepted, expired, cancelled
- **Token Expiry**: 7 days by default

## API Endpoints

### Tenant CRUD

- `POST /api/v1/tenant/create` - Create a new tenant
- `GET /api/v1/tenant/current` - Get current tenant
- `PATCH /api/v1/tenant/settings` - Update tenant settings
- `DELETE /api/v1/tenant/:tenantId` - Delete tenant (admin only)

### Member Management

- `GET /api/v1/tenant/members` - List tenant members
- `POST /api/v1/tenant/members/invite` - Invite member via email
- `PATCH /api/v1/tenant/members/:userId/role` - Update member role
- `DELETE /api/v1/tenant/members/:userId` - Remove member

### Invitations

- `GET /api/v1/tenant/members/invitations` - List pending invitations
- `POST /api/v1/tenant/members/invitations/:token/verify` - Verify invitation token
- `POST /api/v1/tenant/members/invitations/:inviteId/accept` - Accept invitation
- `DELETE /api/v1/tenant/members/invitations/:inviteId` - Cancel invitation
- `POST /api/v1/tenant/members/invitations/:inviteId/resend` - Resend invitation email

### Usage & Limits

- `GET /api/v1/tenant/usage` - Get usage statistics
- `GET /api/v1/tenant/limits` - Get plan limits and usage percentages

## Usage Example

### Creating a Tenant

```javascript
POST /api/v1/tenant/create
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "analyze"
}
```

### Inviting a Member

```javascript
POST /api/v1/tenant/members/invite
{
  "email": "user@example.com",
  "role": "member"
}
```

### Accepting an Invitation

1. User receives email with invitation link
2. User clicks link: `https://app.altihq.com/invite/{token}`
3. Frontend calls: `POST /api/v1/tenant/members/invitations/:token/verify`
4. User signs in or signs up
5. Frontend calls: `POST /api/v1/tenant/members/invitations/:inviteId/accept`

## Roles & Permissions

### Owner

- Full control over tenant
- Cannot be removed
- Can manage all members and settings
- Access to billing

### Admin

- Manage members (invite, remove, update roles)
- Manage content and settings
- View usage and limits
- Cannot access billing

### Member

- View and create content
- No management permissions
- Limited access to settings

## Email Templates

Invitation emails are sent using the template at:
`src/app/templates/emails/tenantInvitation.html`

Template variables:

- `{inviterName}` - Name of the person sending the invite
- `{tenantName}` - Name of the workspace
- `{invitationLink}` - Full URL with token
- `{role}` - Role being offered (Admin/Member)
- `{expiryDays}` - Days until link expires

## Security

- All queries are filtered by tenantId to prevent cross-tenant data access
- Invitation tokens are cryptographically secure (32 bytes)
- Tokens expire after 7 days
- Email verification required for invitation acceptance
- Role-based permission checks on all operations

## Database Indexes

### Tenant Collection

- `{ slug: 1 }` - Unique index
- `{ ownerId: 1, status: 1 }`
- `{ status: 1, plan: 1 }`
- `{ createdAt: -1 }`

### Tenant Invitation Collection

- `{ token: 1 }` - Unique index
- `{ email: 1, tenantId: 1, status: 1 }` - Compound index
- `{ token: 1, status: 1 }`
- `{ expiresAt: 1, status: 1 }`
- TTL index on `expiresAt` (30 days after expiry)

## Related Middleware

See: `src/app/middlewares/tenant/tenantContext.js` for tenant context extraction and permission checks.

## Related Helpers

See: `src/app/helpers/tenantQuery.js` for tenant query filtering helpers.
