# Subscription System Implementation Plan

## 📋 Overview

This document outlines the complete implementation plan for the per-user subscription system with Stripe integration.

**Pricing Model:** Per-user per-month (seat-based billing)

- **Free Trial**: $0/month - 1 user, cannot invite team
- **Explore**: $20/user/month - Unlimited team members
- **Execute**: $50/user/month - Unlimited team members
- **Command**: $100/user/month - Unlimited team members

**Key Concept:** When a team member accepts an invitation on a paid plan, the subscription quantity automatically increases and Stripe charges prorated amount.

---

## ✅ Phase 1: Stripe Products Setup (COMPLETED)

### Status: ✅ DONE

- [x] Created `scripts/seed-stripe-products.js`
- [x] Seeded 4 products to Stripe (Free, Explore, Execute, Command)
- [x] Generated `config/stripe-products.json` with product/price IDs
- [x] Added npm script `npm run seed:stripe`

### Verification

```bash
# Check Stripe Dashboard
https://dashboard.stripe.com/products

# Verify config file
cat config/stripe-products.json
```

---

## 🔄 Phase 2: Database Models

### 2.1 Create Subscription Model

**File:** `src/app/modules/subscription/subscription.model.js`

**Schema:**

```javascript
{
  userId: ObjectId (required, ref: 'User', indexed)
  tenantId: ObjectId (optional, ref: 'Tenant', indexed)

  plan: String (enum: ['free', 'explore', 'execute', 'command'], default: 'free')
  status: String (enum: ['active', 'cancelled', 'past_due', 'trialing'], default: 'active')

  // Stripe Integration
  stripeCustomerId: String
  stripeSubscriptionId: String (unique, sparse, indexed)
  stripeSubscriptionItemId: String // For quantity updates
  stripePriceId: String
  stripeProductId: String

  // Seat Management
  seats: {
    total: Number (default: 1)      // Total seats purchased
    used: Number (default: 1)        // Currently active members
    available: Number (default: 0)   // Calculated: total - used
  }

  pricePerSeat: Number // Store plan price for calculations

  // Usage Limits
  limits: {
    dailyWebSearchLimit: Number
    dailyDeepResearchLimit: Number
    canInviteTeam: Boolean
    unlimitedSeats: Boolean
  }

  // Daily Usage Tracking
  usage: {
    webSearchUsedToday: Number (default: 0)
    deepResearchUsedToday: Number (default: 0)
    lastResetAt: Date (default: Date.now)
  }

  // Billing Info
  billingCycle: {
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelAt: Date
    canceledAt: Date
  }

  createdAt: Date
  updatedAt: Date
}
```

**Indexes:**

```javascript
- userId (unique for user subscriptions)
- tenantId (for team subscriptions)
- stripeSubscriptionId (unique, sparse)
- { plan: 1, status: 1 }
- { status: 1, 'billingCycle.currentPeriodEnd': 1 }
```

**Instance Methods:**

```javascript
-hasReachedLimit(type) - // Check if daily limit reached
  incrementUsage(type) - // Increment usage counter
  resetDailyUsage() - // Reset counters (called by cron)
  canInviteTeam() - // Check if plan allows invites
  addSeat() - // Increment seat count + Stripe update
  removeSeat() - // Decrement seat count + Stripe update
  getAvailableSeats() - // Calculate available seats
  getSeatCost(); // Calculate per-seat cost
```

**Static Methods:**

```javascript
-findByUser(userId) -
  findByTenant(tenantId) -
  findActiveSubscriptions() -
  findExpiring(daysFromNow);
```

---

### 2.2 Update User Model

**File:** `src/app/modules/auth/auth.model.js`

**Add Fields:**

```javascript
{
  subscriptionId: ObjectId (ref: 'Subscription')
  currentPlan: String (enum: ['free', 'explore', 'execute', 'command'], default: 'free')
}
```

**Notes:**

- Keep existing `stripeAccountId` for Stripe customer ID
- Deprecate old subscription fields if any exist

---

### 2.3 Create Subscription Plans Config

**File:** `config/subscription-plans.js`

**Load from stripe-products.json:**

```javascript
import fs from 'fs';
import path from 'path';

const stripeProducts = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/stripe-products.json'))
);

export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free Trial',
    pricePerSeat: 0,
    stripePriceId: stripeProducts.plans.find((p) => p.plan === 'free').priceId,
    stripeProductId: stripeProducts.plans.find((p) => p.plan === 'free')
      .productId,
    limits: {
      dailyWebSearchLimit: 10,
      dailyDeepResearchLimit: 0,
      canInviteTeam: false,
      unlimitedSeats: false,
    },
  },
  explore: {
    name: 'Explore',
    pricePerSeat: 20,
    stripePriceId: stripeProducts.plans.find((p) => p.plan === 'explore')
      .priceId,
    stripeProductId: stripeProducts.plans.find((p) => p.plan === 'explore')
      .productId,
    limits: {
      dailyWebSearchLimit: 1000,
      dailyDeepResearchLimit: 10,
      canInviteTeam: true,
      unlimitedSeats: true,
    },
  },
  execute: {
    /* ... */
  },
  command: {
    /* ... */
  },
};
```

---

## 🔧 Phase 3: Subscription Service

### 3.1 Create Subscription Service

**File:** `src/app/modules/subscription/subscription.service.js`

**Methods to Implement:**

#### `createFreeSubscription(userId, tenantId = null)`

- Get free plan limits from config
- Create subscription record with status 'active'
- Set seats: { total: 1, used: 1, available: 0 }
- Return subscription object

#### `upgradeSubscription(userId, planName, tenantId = null)`

- Validate plan exists
- Get plan config
- Create Stripe checkout session
- Store pending subscription data
- Return checkout URL

#### `processStripeCheckout(sessionId)`

- Called by webhook after successful checkout
- Get session details from Stripe
- Create/update subscription record
- Update user's currentPlan
- Link stripeSubscriptionId and stripeSubscriptionItemId

#### `cancelSubscription(subscriptionId)`

- Get subscription from DB
- Cancel Stripe subscription (immediate or end of period)
- Update status to 'cancelled'
- Downgrade to free plan
- Handle team members if any

#### `addSeatToSubscription(subscriptionId, userId)`

- Get subscription
- Check if paid plan (not free)
- Increment seats.used
- Call Stripe API to update subscription quantity
- Log seat addition
- Return updated subscription

#### `removeSeatFromSubscription(subscriptionId, userId)`

- Get subscription
- Decrement seats.used (min 1 for owner)
- Call Stripe API to decrease quantity
- Log seat removal
- Return updated subscription

#### `checkUsageLimit(userId, limitType)`

- Get user subscription
- Check limit: 'webSearch' or 'deepResearch'
- Return { allowed: boolean, remaining: number, limit: number }

#### `incrementUsage(userId, limitType)`

- Get subscription
- Check if needs daily reset
- Increment counter
- Save asynchronously

#### `getUserSubscription(userId)`

- Find active subscription for user
- Populate tenant if exists
- Return with usage stats

#### `getTenantSubscription(tenantId)`

- Find subscription by tenantId
- Return with seat info and member list

---

## 🎯 Phase 4: Registration Updates

### 4.1 Update Registration Service

**File:** `src/app/modules/auth/auth.service.js`

**In `registerService()` after user creation:**

```javascript
// After email verification token is sent
// Check if user has tenantId
if (!tenantId && !invitationToken) {
  // User signing up without invitation - create free subscription
  const freeSubscription = await subscriptionService.createFreeSubscription(
    user[0]._id
  );

  // Update user
  user[0].subscriptionId = freeSubscription._id;
  user[0].currentPlan = 'free';
  await user[0].save({ session });
}

// If invitationToken exists, subscription handled in invitation acceptance
```

### 4.2 Update Email Confirmation

**File:** `src/app/modules/auth/auth.service.js`

**In `confirmEmailService()` after role update:**

```javascript
// Check if user has subscription
if (!user.subscriptionId) {
  // Create free subscription for users without one
  const freeSubscription = await subscriptionService.createFreeSubscription(
    user._id
  );
  user.subscriptionId = freeSubscription._id;
  user.currentPlan = 'free';
}

await user.save({ validateBeforeSave: false });
```

---

## 👥 Phase 5: Team Invitation Updates

### 5.1 Update Invite Member Pre-Check

**File:** `src/app/modules/tenant/tenant.service.js` - `inviteMember()`

**Before sending invitation:**

```javascript
// Get tenant subscription
const subscription = await subscriptionService.getTenantSubscription(tenantId);

if (!subscription) {
  throw new ApiError(
    httpStatus.BAD_REQUEST,
    'Tenant has no active subscription'
  );
}

// Check if plan allows team invitations
if (!subscription.limits.canInviteTeam) {
  throw new ApiError(
    httpStatus.FORBIDDEN,
    'Free plan limited to 1 user. Upgrade to Explore or higher to invite team members.'
  );
}

// Paid plans have unlimited seats - no check needed
// Continue with invitation flow...
```

### 5.2 Update Accept Invitation

**File:** `src/app/modules/tenant/tenantInvitation.service.js` - `acceptInvitation()`

**After creating TenantMember:**

```javascript
// Get tenant subscription
const subscription = await subscriptionService.getTenantSubscription(
  invitation.tenantId
);

if (subscription && subscription.plan !== 'free') {
  // Add seat to subscription (updates Stripe)
  await subscriptionService.addSeatToSubscription(subscription._id, userId);

  logger.info(
    `Seat added to subscription ${subscription._id} for user ${userId}`
  );
}

// Continue with existing flow...
```

### 5.3 Create Remove Member Function

**File:** `src/app/modules/tenant/tenant.service.js`

**New function:**

```javascript
const removeMember = async (tenantId, userId, removedBy) => {
  // Verify permissions
  const remover = await TenantMember.getUserRole(removedBy, tenantId);
  if (!['owner', 'admin'].includes(remover?.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only owners/admins can remove members'
    );
  }

  // Cannot remove owner
  const member = await TenantMember.findOne({ userId, tenantId });
  if (member.role === 'owner') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot remove tenant owner');
  }

  // Delete member
  await TenantMember.findOneAndDelete({ userId, tenantId });

  // Update user
  await UserModel.findByIdAndUpdate(userId, {
    $unset: { tenantId: 1 },
    activeTenantId: null,
  });

  // Remove seat from subscription
  const subscription =
    await subscriptionService.getTenantSubscription(tenantId);
  if (subscription && subscription.plan !== 'free') {
    await subscriptionService.removeSeatFromSubscription(
      subscription._id,
      userId
    );
  }

  // Update tenant user count
  await Tenant.findByIdAndUpdate(tenantId, {
    $inc: { 'usage.usersCount': -1 },
  });

  logger.info(`Member ${userId} removed from tenant ${tenantId}`);
};
```

---

## 🚦 Phase 6: Usage Limits Middleware

### 6.1 Create Middleware

**File:** `src/app/middlewares/checkSubscriptionLimits.js`

```javascript
import { subscriptionService } from '../../modules/subscription/subscription.service.js';
import ApiError from '../../errors/ApiError.js';
import httpStatus from 'http-status';

const checkSubscriptionLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id || req.user?.id;

      if (!userId) {
        return next(
          new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated')
        );
      }

      // Check limit
      const limitCheck = await subscriptionService.checkUsageLimit(
        userId,
        limitType
      );

      if (!limitCheck.allowed) {
        return next(
          new ApiError(
            httpStatus.TOO_MANY_REQUESTS,
            `Daily ${limitType} limit reached (${limitCheck.limit}). Upgrade your plan to continue.`
          )
        );
      }

      // Increment usage asynchronously (don't wait)
      subscriptionService.incrementUsage(userId, limitType).catch((err) => {
        console.error('Error incrementing usage:', err);
      });

      // Attach remaining count to request
      req.usageRemaining = limitCheck.remaining;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const checkWebSearchLimit = checkSubscriptionLimit('webSearch');
export const checkDeepResearchLimit = checkSubscriptionLimit('deepResearch');
```

### 6.2 Apply to Routes

**Files:** `src/app/modules/search/search.route.js`, `src/app/modules/deep_research/deep_research.route.js`

```javascript
import { checkWebSearchLimit } from '../../middlewares/checkSubscriptionLimits.js';

router.post(
  '/search',
  auth(ENUM_USER_ROLE.USER),
  checkWebSearchLimit, // ← Add middleware
  searchController.search
);
```

---

## 💳 Phase 7: Stripe Webhook Updates

### 7.1 Update Webhook Handler

**File:** `src/app/modules/stripe/webhook.controller.js`

**Handle These Events:**

#### `checkout.session.completed`

```javascript
// User completed checkout
const session = event.data.object;
const subscription = await stripe.subscriptions.retrieve(session.subscription);

await subscriptionService.processStripeCheckout(session.id);
```

#### `customer.subscription.created`

```javascript
// Subscription created in Stripe
const subscription = event.data.object;
// Handle in processStripeCheckout
```

#### `customer.subscription.updated`

```javascript
// Subscription quantity or status changed
const subscription = event.data.object;
const quantity = subscription.items.data[0].quantity;

await Subscription.findOneAndUpdate(
  { stripeSubscriptionId: subscription.id },
  {
    'seats.total': quantity,
    'seats.used': quantity,
    status: subscription.status,
    'billingCycle.currentPeriodStart': new Date(
      subscription.current_period_start * 1000
    ),
    'billingCycle.currentPeriodEnd': new Date(
      subscription.current_period_end * 1000
    ),
  }
);
```

#### `customer.subscription.deleted`

```javascript
// Subscription cancelled
const subscription = event.data.object;

const dbSub = await Subscription.findOne({
  stripeSubscriptionId: subscription.id,
});
await subscriptionService.cancelSubscription(dbSub._id);
```

#### `invoice.payment_succeeded`

```javascript
// Payment successful
const invoice = event.data.object;
// Send confirmation email
// Update subscription status to 'active'
```

#### `invoice.payment_failed`

```javascript
// Payment failed
const invoice = event.data.object;
// Update status to 'past_due'
// Send notification email
// Start grace period
```

---

## 🔄 Phase 8: Cron Jobs

### 8.1 Daily Usage Reset

**File:** `src/app/cron/subscription/resetDailyUsage.js`

```javascript
import cron from 'node-cron';
import Subscription from '../../modules/subscription/subscription.model.js';
import { logger } from '../../../shared/logger.js';

// Run every day at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('Starting daily usage reset...');

    const result = await Subscription.updateMany(
      { status: 'active' },
      {
        $set: {
          'usage.webSearchUsedToday': 0,
          'usage.deepResearchUsedToday': 0,
          'usage.lastResetAt': new Date(),
        },
      }
    );

    logger.info(
      `Daily usage reset completed: ${result.modifiedCount} subscriptions updated`
    );
  } catch (error) {
    logger.error('Error resetting daily usage:', error);
  }
});
```

### 8.2 Sync Stripe Subscriptions

**File:** `src/app/cron/subscription/syncStripeSubscriptions.js`

```javascript
// Run every hour
cron.schedule('0 * * * *', async () => {
  // Fetch subscriptions from database
  // Compare with Stripe API
  // Update discrepancies
  // Log issues
});
```

---

## 🛣️ Phase 9: API Routes

### 9.1 Create Subscription Routes

**File:** `src/app/modules/subscription/subscription.route.js`

```javascript
import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { subscriptionController } from './subscription.controller.js';

const router = express.Router();

// Get current subscription
router.get(
  '/current',
  auth(ENUM_USER_ROLE.USER),
  subscriptionController.getCurrentSubscription
);

// Get available plans
router.get('/plans', subscriptionController.getPlans);

// Create checkout session
router.post(
  '/checkout',
  auth(ENUM_USER_ROLE.USER),
  subscriptionController.createCheckout
);

// Cancel subscription
router.post(
  '/cancel',
  auth(ENUM_USER_ROLE.USER),
  subscriptionController.cancelSubscription
);

// Get usage stats
router.get(
  '/usage',
  auth(ENUM_USER_ROLE.USER),
  subscriptionController.getUsageStats
);

// Get billing details (for team owners)
router.get(
  '/billing',
  auth(ENUM_USER_ROLE.USER),
  subscriptionController.getBillingDetails
);

export const subscriptionRoutes = router;
```

### 9.2 Create Controllers

**File:** `src/app/modules/subscription/subscription.controller.js`

Implement controller methods for all routes.

---

## 📊 Phase 10: Existing User Migration

### 10.1 Create Migration Script

**File:** `scripts/migrate-users-to-free-plan.js`

```javascript
// 1. Backup current data
// 2. Find all users without active subscription
// 3. For each user:
//    - Create free subscription
//    - Update user.subscriptionId
//    - Update user.currentPlan = 'free'
// 4. Handle tenant owners separately
// 5. Generate report
```

**Run Command:**

```bash
# Dry run
node scripts/migrate-users-to-free-plan.js --dry-run

# Actual migration
node scripts/migrate-users-to-free-plan.js
```

---

## 🧪 Phase 11: Testing Checklist

### Manual Testing:

- [ ] New user registers → Gets free subscription
- [ ] Free user tries 11 searches → Gets blocked
- [ ] Free user tries to invite team → Gets error
- [ ] User upgrades to Explore via Stripe → Limits increase
- [ ] User invites member on Explore plan → Member accepts
- [ ] Stripe subscription quantity increases to 2
- [ ] Prorated charge appears in Stripe
- [ ] Member is removed → Quantity decreases to 1
- [ ] User cancels subscription → Downgrades to free
- [ ] Daily reset runs at midnight → Usage counters reset
- [ ] Webhook processes payment success → Status updates
- [ ] Webhook processes payment failure → Status changes to past_due

### API Testing:

- [ ] GET /subscription/current - Returns user subscription
- [ ] GET /subscription/plans - Lists all plans
- [ ] POST /subscription/checkout - Creates Stripe session
- [ ] POST /subscription/cancel - Cancels and downgrades
- [ ] GET /subscription/usage - Returns usage stats
- [ ] GET /subscription/billing - Returns billing details

---

## 🚀 Deployment Checklist

### Pre-Deployment:

- [ ] Test all Stripe webhooks on staging
- [ ] Verify seeded products match production
- [ ] Run migration script on staging database
- [ ] Test upgrade/downgrade flows
- [ ] Verify email notifications work
- [ ] Test team invitation with billing

### Deployment:

- [ ] Deploy code to production
- [ ] Run migration script on production
- [ ] Verify Stripe webhook endpoint
- [ ] Monitor logs for errors
- [ ] Test critical flows

### Post-Deployment:

- [ ] Monitor Stripe dashboard
- [ ] Check subscription creation rate
- [ ] Verify usage limits working
- [ ] Monitor error logs
- [ ] Check customer support tickets

---

## 📝 Environment Variables

**Required:**

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_URL=https://app.altihq.com
```

---

## 🔗 Quick Links

- **Stripe Dashboard:** https://dashboard.stripe.com
- **Products:** https://dashboard.stripe.com/products
- **Subscriptions:** https://dashboard.stripe.com/subscriptions
- **Webhooks:** https://dashboard.stripe.com/webhooks

---

## 📞 Support Resources

**Documentation:**

- Stripe API: https://stripe.com/docs/api
- Stripe Subscriptions: https://stripe.com/docs/billing/subscriptions
- Stripe Webhooks: https://stripe.com/docs/webhooks

**Questions/Issues:**

- Log in project issue tracker
- Review Stripe logs for payment issues
- Check MongoDB logs for sync issues

---

**Last Updated:** January 30, 2026
**Status:** Phase 1 Complete - Ready for Phase 2
