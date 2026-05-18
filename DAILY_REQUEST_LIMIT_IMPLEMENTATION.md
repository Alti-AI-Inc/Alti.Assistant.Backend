# Daily Request Limit Implementation

## Overview

Implemented a daily request limit system where authenticated users can make up to **10 requests per day** across all conversational APIs. The limit resets automatically at midnight every day.

## Features Implemented

### 1. User Model Updates

**File**: `src/app/modules/auth/auth.model.js`

Added new fields to track daily request usage:

```javascript
dailyRequestLimit: {
  requestsUsed: { type: Number, default: 0 },
  maxRequests: { type: Number, default: 10 },
  lastResetAt: { type: Date, default: Date.now }
}
```

### 2. Request Limit Middleware

**File**: `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js`

Created middleware that:

- ✅ Skips checks for guest users (unauthenticated)
- ✅ Bypasses limit for users with active paid subscriptions
- ✅ Automatically resets counter if it's a new day
- ✅ Blocks requests if limit exceeded (returns 429 status)
- ✅ Increments counter on each request
- ✅ Adds response headers for client tracking:
  - `X-Daily-Requests-Used`
  - `X-Daily-Requests-Limit`
  - `X-Daily-Requests-Remaining`

### 3. Automatic Reset at Midnight

**File**: `src/app/middlewares/resetUsage/resetUsage.js`

Updated cron job to:

- ✅ Run at midnight (12:00 AM) Bangladesh Time
- ✅ Reset `dailyRequestLimit.requestsUsed` to 0 for all users
- ✅ Update `dailyRequestLimit.lastResetAt` timestamp

### 4. Applied to Conversational APIs

The middleware has been applied to all main conversational endpoints:

#### Writing & Content Generation

- ✅ `/api/v1/article-writer/assistant`
- ✅ `/api/v1/creative-writing/assistant`
- ✅ `/api/v1/writing/*`
- ✅ `/api/v1/rewrite/assistant`
- ✅ `/api/v1/brainstorm/assistant`

#### Document Processing

- ✅ `/api/v1/documents/assistant`
- ✅ `/api/v1/document-review/assistant`
- ✅ `/api/v1/document-analysis/analyze`

#### Planning & Strategy

- ✅ `/api/v1/plan-generator/assistant`
- ✅ `/api/v1/presentation/assistant`
- ✅ `/api/v1/reports/assistant`

#### Legal Services

- ✅ `/api/v1/legal-contract/assistant`
- ✅ `/api/v1/legal-contract-review/assistant`

#### Search & AI

- ✅ `/api/v1/search/assistant_v2`
- ✅ `/api/v1/search/code`
- ✅ `/api/v1/search/writing`

#### Media Processing

- ✅ `/api/v1/image/generate`
- ✅ `/api/v1/image/analyze`

#### Translation

- ✅ `/api/v1/translation/assistant`

#### Automation & Integrations

- ✅ `/api/v1/composio_v2/chat`
- ✅ `/api/v1/composio_v2/classify-and-execute`
- ✅ `/api/v1/composio-simple/chat`
- ✅ `/api/v1/workflow-automation/chat/create`
- ✅ `/api/v1/workflow-automation/chat/confirm`
- ✅ `/api/v1/workflow-automation/chat/continue`

## User Experience

### For Free Users

- Can make **10 requests per day** across ALL conversational APIs combined
- Limit resets automatically at midnight
- Clear error message when limit exceeded with suggestion to upgrade
- Response headers show remaining requests

### For Subscribed Users

- **Unlimited requests** - bypass the daily limit entirely
- Automatically detected based on `isSubscribed` status and active subscription

### For Guest Users

- **Not affected** by daily limits
- Can continue using APIs without authentication (where `optionalAuth` is used)

## Error Response Example

When limit is exceeded:

```json
{
  "statusCode": 429,
  "message": "Daily request limit exceeded. You have used 10 out of 10 requests today. Your limit will reset at midnight. Consider upgrading to a paid plan for unlimited requests."
}
```

## Response Headers

Every request includes:

```
X-Daily-Requests-Used: 5
X-Daily-Requests-Limit: 10
X-Daily-Requests-Remaining: 5
```

## Database Migration

For existing users, the middleware automatically initializes the `dailyRequestLimit` fields if they don't exist.

## Configuration

To change the daily limit, update the `maxRequests` value in:

- Default value in User model: `auth.model.js`
- Can be customized per user in the database

## Testing

To test the implementation:

1. Make 10 requests to any conversational endpoint
2. The 11th request should return a 429 error
3. Wait for midnight or manually reset the counter in the database
4. Requests should work again after reset

## Notes

- The limit is **per user**, not per endpoint
- All conversational API requests count toward the same 10-request limit
- The system tracks usage in the user's database record
- Cron job ensures automatic daily reset at midnight
- Paid subscribers are automatically exempt from limits
