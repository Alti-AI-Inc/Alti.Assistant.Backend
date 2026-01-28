# Tenant System Testing Plan

## Overview

Comprehensive testing plan for the tenant isolation, billing, and limits system. Covers functional testing, limits enforcement, billing integration, and edge cases.

## Test Environment Setup

### Prerequisites

1. **Local Development Server**: Running on `http://localhost:5000`
2. **Database**: MongoDB with test data
3. **Stripe**: Test mode with test API keys
4. **Postman**: Latest version installed
5. **Test Accounts**:
   - Admin user: `admin@test.com`
   - Tenant owner: `owner@test.com`
   - Tenant member: `member@test.com`

### Environment Variables

Create a Postman environment with these variables:

```json
{
  "baseUrl": "http://localhost:5000/api/v1",
  "adminToken": "",
  "ownerToken": "",
  "memberToken": "",
  "tenantId": "",
  "invitationToken": "",
  "conversationId": "",
  "stripeTestKey": "sk_test_..."
}
```

## Test Phases

### Phase 1: Tenant Management (30 tests)

#### 1.1 Tenant Creation
- ✅ **TC-001**: Create tenant with valid data
- ✅ **TC-002**: Create tenant with duplicate slug (should fail)
- ✅ **TC-003**: Create tenant without authentication (should fail)
- ✅ **TC-004**: Verify default limits for free plan
- ✅ **TC-005**: Verify owner is automatically added as member

#### 1.2 Tenant Retrieval
- ✅ **TC-006**: Get current tenant (authenticated user)
- ✅ **TC-007**: Get tenant by ID (admin only)
- ✅ **TC-008**: List all tenants (admin only)
- ✅ **TC-009**: Filter tenants by plan
- ✅ **TC-010**: Search tenants by name

#### 1.3 Tenant Updates
- ✅ **TC-011**: Update tenant settings (owner)
- ✅ **TC-012**: Update tenant settings (member - should fail)
- ✅ **TC-013**: Update tenant status (admin only)
- ✅ **TC-014**: Update max members setting
- ✅ **TC-015**: Update custom branding

#### 1.4 Tenant Deletion
- ✅ **TC-016**: Soft delete tenant (owner)
- ✅ **TC-017**: Verify data isolation after deletion
- ✅ **TC-018**: Restore deleted tenant (admin)

### Phase 2: Member Management (25 tests)

#### 2.1 Member Invitations
- ✅ **TC-019**: Invite member with valid email
- ✅ **TC-020**: Invite member when at user limit (should fail)
- ✅ **TC-021**: Invite duplicate email (should fail)
- ✅ **TC-022**: Verify invitation email sent
- ✅ **TC-023**: Invitation with admin role
- ✅ **TC-024**: Invitation with member role

#### 2.2 Invitation Acceptance
- ✅ **TC-025**: Accept valid invitation
- ✅ **TC-026**: Accept expired invitation (should fail)
- ✅ **TC-027**: Accept cancelled invitation (should fail)
- ✅ **TC-028**: Verify user count incremented
- ✅ **TC-029**: New user added to tenant

#### 2.3 Member Operations
- ✅ **TC-030**: List all tenant members
- ✅ **TC-031**: Update member role (owner only)
- ✅ **TC-032**: Update own role (should fail)
- ✅ **TC-033**: Remove member (owner only)
- ✅ **TC-034**: Remove self (should fail)
- ✅ **TC-035**: Remove owner (should fail)

#### 2.4 Invitation Management
- ✅ **TC-036**: List pending invitations
- ✅ **TC-037**: Resend invitation
- ✅ **TC-038**: Cancel invitation
- ✅ **TC-039**: Verify invitation token
- ✅ **TC-040**: Rate limit: 5 emails per hour
- ✅ **TC-041**: Retry failed invitation email

### Phase 3: Billing Integration (35 tests)

#### 3.1 Checkout Sessions
- ✅ **TC-042**: Create checkout session (Explore plan)
- ✅ **TC-043**: Create checkout session (Analyze plan)
- ✅ **TC-044**: Verify Stripe customer created
- ✅ **TC-045**: Verify tenant metadata in session
- ✅ **TC-046**: Invalid plan name (should fail)
- ✅ **TC-047**: Invalid duration (should fail)

#### 3.2 Subscription Lifecycle
- ✅ **TC-048**: Complete checkout (webhook simulation)
- ✅ **TC-049**: Verify tenant plan updated
- ✅ **TC-050**: Verify limits updated to plan tier
- ✅ **TC-051**: Verify subscription saved to database
- ✅ **TC-052**: Verify confirmation email sent
- ✅ **TC-053**: Duplicate webhook (idempotency)

#### 3.3 Plan Changes
- ✅ **TC-054**: Upgrade from Free to Explore
- ✅ **TC-055**: Upgrade from Explore to Analyze
- ✅ **TC-056**: Downgrade from Analyze to Explore
- ✅ **TC-057**: Cancel subscription
- ✅ **TC-058**: Verify revert to free plan on cancel
- ✅ **TC-059**: Subscription renewal (webhook)

#### 3.4 Usage & Limits
- ✅ **TC-060**: Get tenant usage statistics
- ✅ **TC-061**: Verify API call count accurate
- ✅ **TC-062**: Verify storage usage accurate
- ✅ **TC-063**: Verify user count accurate
- ✅ **TC-064**: Calculate usage percentages
- ✅ **TC-065**: Format storage bytes to GB

### Phase 4: Limits Enforcement (40 tests)

#### 4.1 API Call Limits
- ✅ **TC-066**: Make API call under limit (success)
- ✅ **TC-067**: Make API call at exact limit (success)
- ✅ **TC-068**: Make API call over limit (429 error)
- ✅ **TC-069**: Verify usage incremented
- ✅ **TC-070**: Verify error message clarity
- ✅ **TC-071**: Unlimited plan (-1) never blocked
- ✅ **TC-072**: Free plan: 1,000 call limit
- ✅ **TC-073**: Explore plan: 10,000 call limit
- ✅ **TC-074**: Multiple tenants isolated

#### 4.2 Storage Limits
- ✅ **TC-075**: Upload file under limit (success)
- ✅ **TC-076**: Upload file at exact limit (success)
- ✅ **TC-077**: Upload file over limit (413 error)
- ✅ **TC-078**: Verify storage tracked after upload
- ✅ **TC-079**: Delete file reduces storage count
- ✅ **TC-080**: Unlimited storage (-1) never blocked
- ✅ **TC-081**: Free plan: 5GB limit
- ✅ **TC-082**: Explore plan: 50GB limit
- ✅ **TC-083**: Storage usage persists across months

#### 4.3 User Limits
- ✅ **TC-084**: Invite user under limit (success)
- ✅ **TC-085**: Invite user at exact limit (success)
- ✅ **TC-086**: Invite user over limit (403 error)
- ✅ **TC-087**: Remove user frees slot
- ✅ **TC-088**: Unlimited users (-1) never blocked
- ✅ **TC-089**: Free plan: 5 user limit
- ✅ **TC-090**: Explore plan: 10 user limit

#### 4.4 Combined Limits
- ✅ **TC-091**: Hit API limit then storage limit
- ✅ **TC-092**: Hit storage limit then user limit
- ✅ **TC-093**: All limits at 100% usage
- ✅ **TC-094**: Upgrade releases all limits
- ✅ **TC-095**: Downgrade applies stricter limits

### Phase 5: Data Isolation (30 tests)

#### 5.1 Cross-Tenant Access
- ✅ **TC-096**: User A cannot see Tenant B conversations
- ✅ **TC-097**: User A cannot access Tenant B members
- ✅ **TC-098**: User A cannot delete Tenant B data
- ✅ **TC-099**: Admin can access all tenants
- ✅ **TC-100**: Verify database queries filter by tenantId

#### 5.2 Service Layer Isolation
- ✅ **TC-101**: Conversation service filters by tenant
- ✅ **TC-102**: Forum service filters by tenant
- ✅ **TC-103**: Notification service filters by tenant
- ✅ **TC-104**: Payment service links to tenant
- ✅ **TC-105**: All 21 services verified

#### 5.3 Aggregation Isolation
- ✅ **TC-106**: Workflow stats only show tenant data
- ✅ **TC-107**: Research stats only show tenant data
- ✅ **TC-108**: Conversation helpers filter correctly
- ✅ **TC-109**: No data leaks in $lookup operations

#### 5.4 Edge Cases
- ✅ **TC-110**: User switches tenants mid-session
- ✅ **TC-111**: Shared email across tenants
- ✅ **TC-112**: User with no tenant (legacy data)
- ✅ **TC-113**: Tenant deleted while user active
- ✅ **TC-114**: Race condition: concurrent requests

### Phase 6: Usage Tracking (20 tests)

#### 6.1 Monthly Reset
- ✅ **TC-115**: API calls reset on 1st of month
- ✅ **TC-116**: Storage NOT reset (cumulative)
- ✅ **TC-117**: Last reset timestamp updated
- ✅ **TC-118**: All tenants reset simultaneously
- ✅ **TC-119**: Manual reset function works

#### 6.2 Trial Management
- ✅ **TC-120**: New tenant starts in trial mode
- ✅ **TC-121**: Trial expires after 14 days
- ✅ **TC-122**: Expired trial suspends tenant
- ✅ **TC-123**: Admin extends trial period
- ✅ **TC-124**: Subscribe before trial ends

#### 6.3 Usage Warnings
- ✅ **TC-125**: Warning at 80% API usage
- ✅ **TC-126**: Warning at 80% storage usage
- ✅ **TC-127**: No warning if unlimited
- ✅ **TC-128**: Email notification sent
- ✅ **TC-129**: Cron job runs daily at 10 AM

### Phase 7: Admin Operations (15 tests)

#### 7.1 Admin Tenant Management
- ✅ **TC-130**: Admin lists all tenants
- ✅ **TC-131**: Admin views tenant details
- ✅ **TC-132**: Admin updates tenant status
- ✅ **TC-133**: Admin extends trial
- ✅ **TC-134**: Admin views tenant usage

#### 7.2 Admin Overrides
- ✅ **TC-135**: Admin bypasses user limits
- ✅ **TC-136**: Admin resets usage manually
- ✅ **TC-137**: Admin cancels subscription
- ✅ **TC-138**: Admin issues refund

#### 7.3 Monitoring
- ✅ **TC-139**: View system-wide usage stats
- ✅ **TC-140**: Export tenant data (CSV)
- ✅ **TC-141**: Audit log of admin actions
- ✅ **TC-142**: Alert on suspicious activity

### Phase 8: Performance Testing (10 tests)

#### 8.1 Load Testing
- ✅ **TC-143**: 100 concurrent API requests
- ✅ **TC-144**: 1000 tenants in database
- ✅ **TC-145**: Large file upload (500MB)
- ✅ **TC-146**: Query performance with indexes

#### 8.2 Stress Testing
- ✅ **TC-147**: Rapid limit checking (1000 req/sec)
- ✅ **TC-148**: Multiple file uploads simultaneously
- ✅ **TC-149**: Bulk invitation sending (100 users)
- ✅ **TC-150**: Webhook flood (duplicate events)

### Phase 9: Security Testing (15 tests)

#### 9.1 Authentication
- ✅ **TC-151**: Access without token (401 error)
- ✅ **TC-152**: Access with invalid token (401 error)
- ✅ **TC-153**: Access with expired token (401 error)
- ✅ **TC-154**: CSRF protection enabled

#### 9.2 Authorization
- ✅ **TC-155**: Member cannot access owner endpoints
- ✅ **TC-156**: User cannot access other tenant data
- ✅ **TC-157**: Admin-only endpoints protected
- ✅ **TC-158**: Invitation token tampering detected

#### 9.3 Input Validation
- ✅ **TC-159**: SQL injection attempt blocked
- ✅ **TC-160**: XSS attempt sanitized
- ✅ **TC-161**: Malformed JSON rejected
- ✅ **TC-162**: File upload validation (type, size)

## Test Execution Schedule

### Sprint 1 (Week 1)
- **Day 1-2**: Phase 1 - Tenant Management (30 tests)
- **Day 3-4**: Phase 2 - Member Management (25 tests)
- **Day 5**: Phase 3 - Billing Integration (35 tests)

### Sprint 2 (Week 2)
- **Day 1-2**: Phase 4 - Limits Enforcement (40 tests)
- **Day 3**: Phase 5 - Data Isolation (30 tests)
- **Day 4**: Phase 6 - Usage Tracking (20 tests)
- **Day 5**: Phase 7 - Admin Operations (15 tests)

### Sprint 3 (Week 3)
- **Day 1**: Phase 8 - Performance Testing (10 tests)
- **Day 2**: Phase 9 - Security Testing (15 tests)
- **Day 3-4**: Bug fixes and retesting
- **Day 5**: Final regression testing

## Success Criteria

### Functional Requirements
- ✅ All 162 test cases pass
- ✅ Zero data leakage between tenants
- ✅ Limits enforced correctly for all plan tiers
- ✅ Billing integration works end-to-end
- ✅ Email notifications sent successfully

### Performance Requirements
- ✅ API response time < 200ms (95th percentile)
- ✅ Database queries use proper indexes
- ✅ Limit checks add < 10ms overhead
- ✅ Support 1000+ concurrent tenants

### Security Requirements
- ✅ All endpoints require authentication
- ✅ Tenant context always verified
- ✅ No SQL injection vulnerabilities
- ✅ Webhook signature verification

## Test Data Setup

### SQL Scripts

```sql
-- Create test tenants
INSERT INTO tenants (name, slug, ownerId, plan, status) VALUES
  ('Acme Corp', 'acme-corp', ObjectId('...'), 'free', 'active'),
  ('Beta Inc', 'beta-inc', ObjectId('...'), 'explore', 'active'),
  ('Gamma LLC', 'gamma-llc', ObjectId('...'), 'analyze', 'active');

-- Create test users
INSERT INTO users (email, firstName, lastName, tenantId, role) VALUES
  ('owner@acme.com', 'John', 'Owner', ObjectId('acme'), 'owner'),
  ('member@acme.com', 'Jane', 'Member', ObjectId('acme'), 'member'),
  ('admin@test.com', 'Admin', 'User', null, 'admin');

-- Set usage to near limits for testing
UPDATE tenants SET 
  'usage.apiCallsUsed' = 950,
  'usage.storageUsed' = 4831838208,
  'usage.usersCount' = 4
WHERE slug = 'acme-corp';
```

## Postman Collections

Import the following collections:

1. **Tenant_Management.postman_collection.json** - Tenant CRUD operations
2. **Member_Management.postman_collection.json** - Invitations and members
3. **Billing_Integration.postman_collection.json** - Stripe checkout and webhooks
4. **Limits_Enforcement.postman_collection.json** - API, storage, user limits
5. **Admin_Operations.postman_collection.json** - Admin-only endpoints

## Running Tests

### Automated Testing

```bash
# Run all collections
newman run Tenant_Management.postman_collection.json -e test_environment.json
newman run Member_Management.postman_collection.json -e test_environment.json
newman run Billing_Integration.postman_collection.json -e test_environment.json
newman run Limits_Enforcement.postman_collection.json -e test_environment.json
newman run Admin_Operations.postman_collection.json -e test_environment.json

# Generate HTML report
newman run Tenant_Management.postman_collection.json -e test_environment.json -r htmlextra
```

### Manual Testing

1. Open Postman
2. Import environment: `test_environment.json`
3. Import collection: Select collection file
4. Run entire collection or individual requests
5. Verify responses match expected results

## Bug Tracking

### Report Template

```markdown
**Bug ID**: BUG-001
**Title**: Brief description
**Severity**: Critical / High / Medium / Low
**Test Case**: TC-XXX
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Result**: What should happen
**Actual Result**: What actually happened
**Screenshots**: Attach if applicable
**Environment**: Local / Staging / Production
```

## Regression Testing

Run after any code changes:

1. **Quick Smoke Test** (15 min)
   - TC-001: Create tenant
   - TC-019: Invite member
   - TC-042: Create checkout session
   - TC-066: Make API call
   - TC-096: Verify data isolation

2. **Full Regression** (4 hours)
   - All 162 test cases
   - Automated via Newman

## Sign-off Criteria

- [ ] All test phases completed
- [ ] 95%+ test pass rate
- [ ] All critical bugs fixed
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation reviewed
- [ ] Stakeholder approval

---

**Prepared By**: Backend Team  
**Date**: January 27, 2026  
**Version**: 1.0.0
