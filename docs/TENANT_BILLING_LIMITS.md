# Tenant Billing & Limits Integration

## Overview

Phase 6 implements comprehensive billing integration with Stripe and enforces tenant-level resource limits. This ensures fair resource allocation, prevents abuse, and enables monetization through tiered subscription plans.

## Architecture

### Components

1. **Billing Integration** (`src/app/modules/payment/payment.service.js`)

   - Tenant-level Stripe customers
   - Subscription lifecycle management
   - Plan limits configuration

2. **Limits Middleware** (`src/app/middlewares/tenant/checkTenantLimits.js`)

   - API call rate limiting
   - Storage quota enforcement
   - User count restrictions

3. **Usage Tracking** (`src/app/cron/tenant/resetUsage.js`)
   - Monthly usage reset
   - Trial expiration handling
   - Usage warning notifications

## Features

### 1. Tenant-Level Billing

Subscriptions are now tied to tenants (workspaces) rather than individual users:

**Benefits:**

- Single subscription covers all team members
- Owner manages billing for entire workspace
- Simplified billing for teams
- Centralized plan management

**Implementation:**

```javascript
// Create Stripe customer for tenant
const customer = await stripe.customers.create({
  email: user.email,
  name: tenant.name,
  metadata: {
    tenantId: tenant._id.toString(),
    tenantSlug: tenant.slug,
    ownerId: tenant.ownerId.toString(),
  },
});

// Link subscription to tenant
tenant.subscription = {
  stripeCustomerId: customer.id,
  stripeSubscriptionId: subscription.id,
  status: 'active',
};
```

### 2. Plan Limits

Each plan tier includes specific resource limits:

| Plan           | API Calls/Month | Storage   | Max Users | Price   |
| -------------- | --------------- | --------- | --------- | ------- |
| **Free**       | 1,000           | 5 GB      | 5         | $0      |
| **Explore**    | 10,000          | 50 GB     | 10        | $29/mo  |
| **Analyze**    | 50,000          | 100 GB    | 25        | $99/mo  |
| **Execute**    | 200,000         | 500 GB    | 100       | $299/mo |
| **Command**    | Unlimited       | 1 TB      | Unlimited | $999/mo |
| **Enterprise** | Unlimited       | Unlimited | Unlimited | Custom  |

**Configuration:**

```javascript
const PLAN_LIMITS = {
  free: {
    maxApiCalls: 1000,
    maxStorage: 5368709120, // 5GB
    maxUsers: 5,
  },
  explore: {
    maxApiCalls: 10000,
    maxStorage: 53687091200, // 50GB
    maxUsers: 10,
  },
  // ... more plans
};
```

### 3. Limits Enforcement

Three types of limits are enforced:

#### API Call Limits

**Middleware:** `checkApiCallLimit`

Applied to AI endpoints that consume computational resources:

- Conversation creation
- Message sending
- Plan generation
- Document analysis

**Behavior:**

- Checks current usage vs. limit before request
- Increments counter after check passes
- Returns 429 error if limit reached
- Provides clear upgrade messaging

**Usage:**

```javascript
router.post(
  '/assistant',
  auth(),
  extractTenantContext,
  checkApiCallLimit, // ← Enforce API limit
  assistantController.generate
);
```

**Error Response:**

```json
{
  "success": false,
  "statusCode": 429,
  "message": "API call limit reached. You have used 1000 of 1000 calls. Please upgrade your plan or wait for the monthly reset.",
  "data": {
    "limitType": "api_call",
    "used": 1000,
    "limit": 1000,
    "resetAt": "2026-02-01T00:00:00.000Z",
    "plan": "free"
  }
}
```

#### Storage Limits

**Middleware:** `checkStorageLimit(fileSize)`

Applied to file upload endpoints:

- Document uploads
- Image uploads
- Attachment uploads

**Behavior:**

- Checks if adding file would exceed limit
- Parameterized with expected file size
- Tracks actual usage after successful upload
- Prevents uploads that would exceed quota

**Usage:**

```javascript
router.post(
  '/upload',
  auth(),
  extractTenantContext,
  checkStorageLimit(10485760), // ← Check 10MB limit
  upload.single('file'),
  trackStorageUsage, // ← Track actual usage
  uploadController.handleUpload
);
```

**Error Response:**

```json
{
  "success": false,
  "statusCode": 413,
  "message": "Storage limit would be exceeded. Current usage: 4.8 GB, File size: 500 MB, Limit: 5 GB. Please upgrade your plan or free up space.",
  "data": {
    "limitType": "storage",
    "used": 5153960755,
    "fileSize": 524288000,
    "limit": 5368709120,
    "plan": "free"
  }
}
```

#### User Limits

**Middleware:** `checkUserLimit`

Applied to user invitation endpoints:

- Tenant member invitations
- User additions

**Behavior:**

- Checks current user count vs. limit
- Prevents invitations if limit reached
- Provides upgrade messaging

**Usage:**

```javascript
router.post(
  '/members/invite',
  auth(),
  checkUserLimit, // ← Check user limit
  inviteController.sendInvitation
);
```

**Error Response:**

```json
{
  "success": false,
  "statusCode": 403,
  "message": "User limit reached. You have 5 of 5 users. Please upgrade your plan to add more team members.",
  "data": {
    "limitType": "user",
    "used": 5,
    "limit": 5,
    "plan": "free"
  }
}
```

### 4. Usage Tracking

#### Monthly Reset

**Cron Schedule:** `0 0 1 * *` (Midnight on 1st of each month)

Resets API call counters for all active tenants:

```javascript
await Tenant.updateMany(
  { deletedAt: null },
  {
    $set: {
      'usage.apiCallsUsed': 0,
      'usage.lastResetAt': new Date(),
    },
  }
);
```

**Note:** Storage usage is NOT reset monthly - it's cumulative.

#### Trial Expiration

**Cron Schedule:** `0 2 * * *` (Daily at 2 AM)

Suspends tenants whose trial period has ended:

```javascript
await Tenant.updateMany(
  {
    status: 'trial',
    'subscription.trialEndsAt': { $lt: new Date() },
  },
  { $set: { status: 'suspended' } }
);
```

#### Usage Warnings

**Cron Schedule:** `0 10 * * *` (Daily at 10 AM)

Sends warnings to tenants at 80% of their API limit:

```javascript
const tenantsNearLimit = await Tenant.find({
  $expr: {
    $gte: ['$usage.apiCallsUsed', { $multiply: ['$limits.maxApiCalls', 0.8] }],
  },
});
// TODO: Send warning emails
```

## Subscription Lifecycle

### 1. New Subscription

**Flow:**

1. User clicks "Upgrade" in UI
2. Backend creates Stripe checkout session with tenant metadata
3. User completes payment
4. Stripe webhook `checkout.session.completed` fires
5. Backend updates tenant plan and limits
6. User gains access to new features immediately

**Code:**

```javascript
// Webhook handler
if (event.type === 'checkout.session.completed') {
  const tenant = await Tenant.findById(metadata.tenantId);

  // Update tenant
  tenant.plan = metadata.plan_name;
  tenant.status = 'active';
  tenant.limits = PLAN_LIMITS[metadata.plan_name];
  tenant.subscription = {
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscription.id,
    status: 'active',
    currentPeriodEnd: expirationDate,
  };

  await tenant.save();
}
```

### 2. Subscription Renewal

Handled automatically by Stripe:

- Stripe charges card on renewal date
- No backend changes needed
- `currentPeriodEnd` updated via webhook

### 3. Subscription Cancellation

**Flow:**

1. User cancels subscription in Stripe dashboard
2. Stripe webhook `customer.subscription.deleted` fires
3. Backend reverts tenant to free plan
4. Limits reduced to free tier
5. User retains access until period end

**Code:**

```javascript
if (event.type === 'customer.subscription.deleted') {
  const tenant = await Tenant.findById(subscription.tenantId);

  // Revert to free plan
  tenant.plan = 'free';
  tenant.status = 'active';
  tenant.limits = PLAN_LIMITS.free;
  tenant.subscription.status = 'cancelled';

  await tenant.save();
}
```

### 4. Failed Payment

Handled by Stripe's built-in retry logic:

- Stripe retries failed charges automatically
- Tenant status remains active during retry period
- After final failure, subscription cancelled
- Webhook triggers reversion to free plan

## Usage Statistics API

Get tenant usage information:

**Endpoint:** `GET /api/v1/tenant/usage`

**Middleware:** `getTenantUsage`

**Response:**

```json
{
  "success": true,
  "data": {
    "apiCalls": {
      "used": 437,
      "limit": 1000,
      "percentage": 44,
      "remaining": 563
    },
    "storage": {
      "used": 2147483648,
      "limit": 5368709120,
      "percentage": 40,
      "usedFormatted": "2 GB",
      "limitFormatted": "5 GB",
      "remaining": "3 GB"
    },
    "users": {
      "used": 3,
      "limit": 5,
      "percentage": 60,
      "remaining": 2
    },
    "plan": "free",
    "status": "active",
    "lastResetAt": "2026-01-01T00:00:00.000Z"
  }
}
```

## Testing

### 1. Test API Call Limits

```javascript
// Make requests until limit reached
for (let i = 0; i < 1001; i++) {
  const response = await fetch('/api/v1/conversations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'Test' }),
  });

  if (i < 1000) {
    expect(response.status).toBe(200);
  } else {
    expect(response.status).toBe(429); // Too Many Requests
  }
}
```

### 2. Test Storage Limits

```javascript
// Upload files until storage limit reached
const fileSize = 1073741824; // 1GB
for (let i = 0; i < 6; i++) {
  const response = await uploadFile(fileSize);

  if (i < 5) {
    expect(response.status).toBe(200);
  } else {
    expect(response.status).toBe(413); // Payload Too Large
  }
}
```

### 3. Test User Limits

```javascript
// Invite users until limit reached
for (let i = 0; i < 6; i++) {
  const response = await inviteUser(`user${i}@test.com`);

  if (i < 5) {
    expect(response.status).toBe(200);
  } else {
    expect(response.status).toBe(403); // Forbidden
  }
}
```

### 4. Test Plan Upgrade

```javascript
// Create checkout session
const session = await createCheckoutSession('explore');
expect(session.url).toContain('stripe.com');

// Simulate webhook
await handleStripeWebhook({
  type: 'checkout.session.completed',
  data: { object: mockSession },
});

// Verify tenant updated
const tenant = await Tenant.findById(tenantId);
expect(tenant.plan).toBe('explore');
expect(tenant.limits.maxApiCalls).toBe(10000);
```

## Monitoring

### Key Metrics

1. **API Call Usage by Plan**

   - Track average usage per plan tier
   - Identify underutilized/overutilized plans
   - Adjust pricing based on usage patterns

2. **Storage Usage Growth**

   - Monitor storage growth rate
   - Predict capacity needs
   - Identify storage-heavy users

3. **Plan Upgrade Conversion Rate**

   - Track free → paid conversions
   - Measure upgrade timing (days after signup)
   - A/B test pricing and features

4. **Limit Hit Frequency**
   - How often tenants hit limits
   - Which limits are hit most
   - Optimize limit thresholds

### Logging

All limit enforcement is logged:

```javascript
logger.warn('Tenant API call limit reached', {
  tenantId: tenant._id,
  tenantName: tenant.name,
  used: tenant.usage.apiCallsUsed,
  limit: tenant.limits.maxApiCalls,
});
```

## Error Handling

### Limit Exceeded Errors

All limit errors include:

- **Status Code:** 429 (API), 413 (Storage), 403 (Users)
- **Error Message:** Clear explanation
- **Usage Data:** Current usage and limits
- **Upgrade CTA:** Link to upgrade page

### Graceful Degradation

- Limits only block resource-intensive operations
- Read operations (fetching data) unaffected
- Users can still access existing content
- Clear messaging guides users to upgrade

## Security Considerations

### 1. Tenant Isolation

- Limits enforced per tenant, not per user
- Users can't bypass limits by creating multiple accounts
- Admin users subject to same limits as regular users

### 2. Rate Limiting

- Tenant limits separate from rate limiting
- Rate limiting prevents abuse (50 req/15min)
- Tenant limits control resource consumption (1000 req/month)

### 3. Webhook Security

- Stripe signature verification required
- Webhook events processed atomically
- Duplicate webhook protection

## Migration Guide

### Existing Users

For users created before tenant system:

1. **Create Default Tenant:**

```javascript
// Migration script
for (const user of existingUsers) {
  const tenant = await Tenant.create({
    name: `${user.firstName}'s Workspace`,
    slug: generateSlug(user.email),
    ownerId: user._id,
    plan: user.isSubscribed ? user.subscription.plan_name : 'free',
    status: user.isSubscribed ? 'active' : 'trial',
  });

  user.tenantId = tenant._id;
  await user.save();
}
```

2. **Migrate Subscriptions:**

```javascript
// Link existing Stripe subscriptions to tenants
for (const subscription of existingSubscriptions) {
  const user = await User.findById(subscription.userId);
  const tenant = await Tenant.findById(user.tenantId);

  tenant.subscription = {
    stripeCustomerId: /* fetch from Stripe */,
    stripeSubscriptionId: subscription.transactionId,
    status: 'active',
  };

  await tenant.save();
}
```

## Future Enhancements

### Planned Features

- [ ] **Usage Analytics Dashboard:** Visual charts of usage trends
- [ ] **Custom Plan Creation:** Admin-defined custom plans
- [ ] **Overage Billing:** Charge for usage beyond limits
- [ ] **Plan Downgrades:** Allow plan downgrades at period end
- [ ] **Usage Notifications:** In-app notifications at 50%, 80%, 100%
- [ ] **Resource Pooling:** Share limits across multiple tenants (enterprises)
- [ ] **Pay-as-you-go:** Usage-based pricing option
- [ ] **Rollover Credits:** Unused API calls roll to next month
- [ ] **Commitment Discounts:** Annual prepay discounts
- [ ] **Partner Pricing:** Special pricing for partners/resellers

### Performance Optimizations

- [ ] **Cache Limits:** Cache tenant limits in Redis
- [ ] **Bulk Updates:** Batch limit checks for multiple operations
- [ ] **Async Tracking:** Queue usage tracking for async processing
- [ ] **Approximate Counts:** Use approximate counting for high-volume metrics

## Support

### Common Issues

**Q: Why am I seeing "API limit reached" errors?**  
A: Your tenant has exceeded its monthly API call limit. Upgrade your plan or wait for the monthly reset on the 1st.

**Q: When do limits reset?**  
A: API call limits reset on the 1st of each month at midnight. Storage limits are cumulative and don't reset.

**Q: Can I get a refund if I downgrade?**  
A: Yes, contact support for prorated refunds on plan downgrades.

**Q: What happens when my trial ends?**  
A: Your account is suspended until you subscribe. Your data is preserved for 30 days.

---

**Last Updated:** January 27, 2026  
**Version:** 1.0.0  
**Maintainer:** Backend Team
