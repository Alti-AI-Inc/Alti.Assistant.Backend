import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserModel from './src/app/modules/auth/auth.model.js';
import Notification from './src/app/modules/notification/notification.model.js';

dotenv.config();

// Dummy outputs content definition
const dummyNotifications = [
  {
    title: '📊 Underwriting & Valuation Report: 742 Evergreen Terrace',
    description: 'Commercial real estate underwriting review completed with 1.50x DSCR.',
    category: 'workflow',
    isArchived: false,
    isRead: false,
    payload: {
      status: 'success',
      executionId: 'exec-cre-success-998',
      workflowName: 'CRE Commercial Real Estate Underwriter',
      duration: 42500,
      summary: `# Commercial Real Estate Underwriting & Valuation Report

## Executive Summary
We have completed the underwriting review for the target multifamily asset. The analysis confirms a strong debt service coverage ratio (DSCR) and supports the proposed acquisition loan structure.

## Property Metrics
* **Address:** 742 Evergreen Terrace
* **Units:** 120 Units (Class B Multifamily)
* **Purchase Price:** $18,400,000
* **Loan Amount:** $12,880,000 (70% LTV)

## Financial Valuation
* **Gross Potential Income:** $1,860,000
* **Vacancy Factor (5.0%):** -$93,000
* **Effective Gross Income (EGI):** $1,767,000
* **Operating Expenses (42%):** -$742,140
* **Net Operating Income (NOI):** $1,024,860

## Underwriting Debt Service Analysis
* **Annual Debt Service:** $683,240 (5.25% Interest Rate, 30-yr Amortization)
* **Debt Service Coverage Ratio (DSCR):** **1.50x** (Requirement: > 1.25x)
* **Debt Yield:** **7.96%**

## Risk Assessment & Underwriter Recommendation
The asset exhibits stable historical occupancy (>94%) and strong net operating income. Underwriter recommends approval of the $12.88M senior debt facility.`,
      results: [
        { stepId: 'Fetch Historical Rent Rolls', success: true, duration: 1200 },
        { stepId: 'Calculate Operating Expense Ratios', success: true, duration: 800 },
        { stepId: 'Perform Sensitivity Analysis (Cap Rates)', success: true, duration: 1500 },
        { stepId: 'Compile Underwriting Digest PDF', success: true, duration: 4200 }
      ]
    }
  },
  {
    title: '🔍 SaaS Pricing Competitor Scan - AI Swarm Platforms',
    description: 'Autonomous market intelligence scan compiled for major developer AI platforms.',
    category: 'workflow',
    isArchived: false,
    isRead: false,
    payload: {
      status: 'success',
      executionId: 'exec-pricing-scan-332',
      workflowName: 'SaaS Market Intelligence Agent',
      duration: 28400,
      summary: `# Competitor Intelligence Scan: AI Swarm & Orchestration Platforms

## Overview
This autonomous intelligence agent completed a comprehensive competitive analysis of market leaders in the developer-facing AI swarm orchestration space.

## Monitored Competitors
1. **Langgraph Cloud** (Enterprise focused workflow graphs)
2. **CrewAI Enterprise** (SaaS workspace and task-agent managers)
3. **Autogen Studio (Microsoft)** (Multi-agent chat networks)

## Core Feature Comparison
* **State Persistence:** CrewAI and Langgraph support multi-user state tracking; Autogen relies heavily on client-side state.
* **Pricing Models:**
  * *Langgraph:* $0.10/run + compute charges (Usage-based billing).
  * *CrewAI Enterprise:* Flat $1,200/mo base for up to 10 active developer seats.
  * *Autogen Studio:* Open-source, self-hosted (zero license costs).

## Key Market Risks & Gaps
Our pricing comparison reveals a significant customer acquisition gap: developers prefer flat-rate sandboxes over usage-based execution keys. Underwriter notes that Alti can capture substantial market share by introducing flat billing tiers with generous token caps.`,
      results: [
        { stepId: 'Scrape Pricing Pages', success: true, duration: 4300 },
        { stepId: 'Analyze API Documentation', success: true, duration: 3200 },
        { stepId: 'Map Feature Matrices', success: true, duration: 1800 },
        { stepId: 'Synthesize Market Intelligence', success: true, duration: 2400 }
      ]
    }
  },
  {
    title: '⚠️ Sports Arbitrage Scanner - Low Liquidity Alert',
    description: 'Arbitrage check complete with 3 low-liquidity warnings on NBA spreads.',
    category: 'workflow',
    isArchived: false,
    isRead: false,
    payload: {
      status: 'warning',
      executionId: 'exec-sports-warning-887',
      workflowName: 'Aviationstack & PredictionData Sports Scraper',
      duration: 18500,
      summary: `# Warning: Sports Arbitrage Odds Scan Alert

## Job Status
The job completed, but with **3 low-liquidity warnings** identified on minor betting exchanges.

## Scrape Details
* **Target League:** NBA Playoffs
* **Scraped Bookmakers:** DraftKings, FanDuel, Pinnacle, Bovada
* **Execution Time:** May 30, 2026

## Warnings Summary
* **Pinnacle Sportsbook:** High-spread limit detected on moneyline delta. Odds might fluctuate rapidly before bet placement is completed.
* **Bovada Exchange:** Low liquidity ($320 limit) detected on player props spreads. Recommended maximum wager size scaled down.

## Action Items
1. Wagers above $300 should bypass Bovada and target Pinnacle directly.
2. Re-trigger arbitrage check in 5 minutes for updated spreads.`,
      results: [
        { stepId: 'Connect Bookmaker WebSockets', success: true, duration: 1100 },
        { stepId: 'Fetch Real-Time Spreads', success: true, duration: 5200 },
        { stepId: 'Calculate Arbitrage Deltas', success: true, duration: 900, error: 'Low liquidity on Bovada props ($320 limit)' }
      ]
    }
  },
  {
    title: '❌ Temporal Ingestion Pipeline Failure',
    description: 'Database ingestion sync terminated due to remote shard socket timeout.',
    category: 'workflow',
    isArchived: false,
    isRead: false,
    payload: {
      status: 'failed',
      executionId: 'exec-temporal-crash-001',
      workflowName: 'Temporal Database Ingestion & Sync',
      duration: 8900,
      summary: `# CRITICAL ERROR: Ingestion Sync Pipeline Crashed

## Execution Details
* **Run ID:** exec-temporal-crash-001
* **Trigger Event:** Scheduled Cron Sync
* **Target Collection:** \`workflows_history\`

## Root Cause Analysis
The sync execution was terminated because the database connection timed out after 3 retries. The remote shard replica set failed to respond within the 5000ms socket window.

## Error Logs
\`\`\`
[2026-05-30T14:31:02.194Z] ERROR [IngestionService] Shard replica set secondary offline
[2026-05-30T14:31:07.198Z] WARN  [MongooseClient] Retrying socket connection (1/3)
[2026-05-30T14:31:12.203Z] WARN  [MongooseClient] Retrying socket connection (2/3)
[2026-05-30T14:31:17.208Z] ERROR [MongooseClient] Retries exhausted. Connection timed out.
[2026-05-30T14:31:17.210Z] FATAL [TemporalWorkflowEngine] Workflow terminated. Code: 504_TIMEOUT
\`\`\`

## Remediation Plan
1. Verify that the MongoDB Atlas cluster is healthy and accessible from the VM IP address.
2. Re-run the synchronization job manually once network availability is restored.`,
      results: [
        { stepId: 'Initialize Sync Session', success: true, duration: 500 },
        { stepId: 'Query Workflows History Delta', success: true, duration: 1400 },
        { stepId: 'Stream Batched Inserts', success: false, duration: 5000, error: 'Remote shard connection timed out' }
      ]
    }
  }
];

async function run() {
  const dbUrl = process.env.DATABASE_LOCAL;
  console.log('Connecting to database:', dbUrl);
  
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4,
    });
    console.log('Connected to database successfully!');
    
    // Step 1: Clean up all existing notifications
    console.log('Cleaning up existing notifications...');
    const deleteNotifResult = await Notification.deleteMany({});
    console.log(`Deleted ${deleteNotifResult.deletedCount} notifications.`);
    
    const updateUsersResult = await UserModel.updateMany({}, { $set: { notifications: [] } });
    console.log(`Reset notifications array for ${updateUsersResult.modifiedCount} users.`);
    
    // Step 2: Query all users
    const users = await UserModel.find({});
    console.log(`Found ${users.length} users to seed.`);
    
    let totalNotificationsSeeded = 0;
    
    // Step 3: Seed notifications for each user
    for (const user of users) {
      const createdNotificationIds = [];
      
      // Personal mode notifications (tenantId: null)
      for (const dummy of dummyNotifications) {
        const notifData = {
          ...dummy,
          userId: user._id,
          tenantId: null
        };
        const newNotif = await Notification.create(notifData);
        createdNotificationIds.push(newNotif._id);
        totalNotificationsSeeded++;
      }
      
      // Tenant mode notifications (if user has a tenantId)
      if (user.tenantId) {
        for (const dummy of dummyNotifications) {
          const notifData = {
            ...dummy,
            userId: user._id,
            tenantId: user.tenantId
          };
          const newNotif = await Notification.create(notifData);
          createdNotificationIds.push(newNotif._id);
          totalNotificationsSeeded++;
        }
      }
      
      // Update the user's notifications array
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { notifications: createdNotificationIds } }
      );
      
      console.log(`Seeded notifications for user: ${user.email} (Tenant: ${user.tenantId || 'None'})`);
    }
    
    console.log(`\n================================================`);
    console.log(`SUCCESS: Seeding completed!`);
    console.log(`Total notifications created: ${totalNotificationsSeeded}`);
    console.log(`================================================\n`);
    
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  }
}

run();
