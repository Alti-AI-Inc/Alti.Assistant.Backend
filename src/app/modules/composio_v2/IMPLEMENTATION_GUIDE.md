# Step-by-Step Implementation Guide: Simplified Composio Module

**Goal:** Create a new simplified Composio module alongside the existing complex one, allowing for safe comparison and gradual migration.

**Timeline:** 3-5 days for complete implementation  
**Strategy:** Build new module in parallel, test thoroughly, then switch via feature flag

---

## Overview

We'll create a new simplified module structure:

```
src/app/modules/
├── composio_v2/                    (Keep as-is - legacy system)
│   └── [All existing files remain unchanged]
└── composio_simple/                (New simplified module)
    ├── composio.controller.js      (HTTP handlers)
    ├── composio.service.js         (Core logic - all in one)
    ├── composio.conversation.js    (Conversation storage)
    ├── composio.model.js           (Reuse from v2 or copy)
    ├── composio.route.js           (API routes)
    └── README.md                   (Module documentation)
```

---

## Phase 1: Setup and Structure (Day 1)

### Step 1.1: Create Module Directory

**Action:** Create the new module directory structure

```bash
# Navigate to modules directory
cd src/app/modules

# Create new simplified module
mkdir composio_simple
cd composio_simple

# Create initial files
touch composio.controller.js
touch composio.service.js
touch composio.conversation.js
touch composio.route.js
touch README.md
```

**Result:** Empty module structure ready for implementation

---

### Step 1.2: Copy Shared Models

**Action:** Reuse existing models (auth connections) from composio_v2

**Option A - Symlink (Recommended):**

```bash
# From composio_simple directory
# We'll just import from composio_v2 in code
```

**Option B - Copy if needed:**

```bash
cp ../composio_v2/composio.model.js ./composio.model.js
cp ../composio_v2/authConfig.model.js ./authConfig.model.js
```

**Decision:** We'll import from composio_v2 to avoid duplication:

```javascript
// In composio_simple files
import ComposioAuth from '../composio_v2/composio.model.js';
import AuthConfig from '../composio_v2/authConfig.model.js';
```

**Result:** Shared models accessible without duplication

---

## Phase 2: Core Service Implementation (Day 2)

### Step 2.1: Create Conversation Service

**Action:** Build simple conversation storage handler

**File:** `composio_simple/composio.conversation.js`

```javascript
import Conversation from '../conversations/conversation.model.js';

/**
 * Simple conversation management for Composio
 */

/**
 * Generate a unique conversation ID
 */
export const generateConversationId = () => {
  return `composio-simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get conversation
 */
export const getOrCreateConversation = async (
  userId,
  conversationId,
  initialMessage
) => {
  if (conversationId) {
    // Try to get existing conversation
    const existing = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (existing) return existing;
  }

  // Create new conversation
  const newConversationId = generateConversationId();
  const conversation = new Conversation({
    conversationId: newConversationId,
    userId: userId,
    title:
      initialMessage.length > 50
        ? `${initialMessage.substring(0, 50)}...`
        : initialMessage,
    messages: [],
    metadata: {
      category: 'composio_simple',
      version: '1.0',
    },
    status: 'active',
  });

  await conversation.save();
  return conversation;
};

/**
 * Get recent messages (last N messages)
 */
export const getRecentMessages = async (conversationId, userId, limit = 5) => {
  try {
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (!conversation || !conversation.messages) return [];

    // Return last N messages in chronological order
    const recentMessages = conversation.messages.slice(-limit);

    return recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  } catch (error) {
    console.error('Error getting recent messages:', error);
    return [];
  }
};

/**
 * Save message to conversation
 */
export const saveMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {}
) => {
  try {
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.messages.push({
      role: role,
      content: content,
      timestamp: new Date(),
      metadata: metadata,
    });

    conversation.lastActivity = new Date();
    conversation.messageCount = conversation.messages.length;

    await conversation.save();
    return conversation;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
};

/**
 * Get user's conversations
 */
export const getUserConversations = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'lastActivity',
    sortOrder = -1,
  } = options;

  const skip = (page - 1) * limit;

  const conversations = await Conversation.find({
    userId: userId,
    'metadata.category': 'composio_simple',
  })
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Conversation.countDocuments({
    userId: userId,
    'metadata.category': 'composio_simple',
  });

  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export const conversationService = {
  generateConversationId,
  getOrCreateConversation,
  getRecentMessages,
  saveMessage,
  getUserConversations,
};
```

**Lines:** ~150 lines  
**Result:** Complete conversation management with minimal complexity

---

### Step 2.2: Create Main Service (Core Logic)

**Action:** Build the heart of the simplified system

**File:** `composio_simple/composio.service.js`

```javascript
import { Composio } from '@composio/core';
import OpenAI from 'openai';
import config from '../../../../config/index.js';
import ComposioAuth from '../composio_v2/composio.model.js';
import { conversationService } from './composio.conversation.js';

// Initialize Composio and OpenAI
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

const openai = new OpenAI({
  apiKey: config.openai_secret_key,
});

/**
 * Main execution function - handles both single and multi-step actions
 */
export const executeUserRequest = async (
  userMessage,
  userId,
  conversationId = null
) => {
  const startTime = Date.now();

  try {
    // 1. Get or create conversation
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      conversationId,
      userMessage
    );
    const actualConversationId = conversation.conversationId;

    // 2. Get recent conversation history for context
    const recentMessages = conversationId
      ? await conversationService.getRecentMessages(conversationId, userId, 5)
      : [];

    // 3. Get user's available tools from Composio
    const tools = await composio.tools.get(userId, {
      // Get all tools for user's connected accounts
    });

    console.log(`Found ${tools.length} tools for user ${userId}`);

    // 4. Build messages array with context
    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant that can use various integrated apps and tools to help users.
Available tools: ${tools.map((t) => t.function.name).join(', ')}

IMPORTANT RULES:
1. Always provide complete, non-null values for all required parameters
2. For missing information, use reasonable defaults or ask the user
3. Execute tools confidently when you have enough information
4. Chain multiple tools if the task requires it
5. Be concise and action-oriented`,
      },
      ...recentMessages,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // 5. Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: 'auto', // Let the model decide
      temperature: 0,
    });

    console.log('OpenAI response received:', response.choices[0].finish_reason);

    // 6. Check if tools were called
    if (response.choices[0].finish_reason === 'tool_calls') {
      // Execute tools via Composio
      const toolResults = await composio.provider.handleToolCalls(
        userId,
        response,
        {}
      );

      console.log(`Executed ${toolResults.length} tool(s)`);

      // Extract result content
      const resultContent = toolResults.map((r) => r.content).join('\n');
      const toolNames = response.choices[0].message.tool_calls.map(
        (tc) => tc.function.name
      );

      // 7. Save messages to conversation
      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'user',
        userMessage,
        { timestamp: new Date() }
      );

      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'assistant',
        resultContent,
        {
          toolsUsed: toolNames,
          executionTime: `${Date.now() - startTime}ms`,
          timestamp: new Date(),
        }
      );

      // 8. Return result
      return {
        success: true,
        data: {
          response: resultContent,
          conversationId: actualConversationId,
          toolsUsed: toolNames,
          executionTime: `${Date.now() - startTime}ms`,
          messageCount: conversation.messageCount + 2,
        },
      };
    } else {
      // No tool calls - just conversation
      const assistantMessage = response.choices[0].message.content;

      // Save messages
      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'user',
        userMessage
      );

      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'assistant',
        assistantMessage
      );

      return {
        success: true,
        data: {
          response: assistantMessage,
          conversationId: actualConversationId,
          toolsUsed: [],
          executionTime: `${Date.now() - startTime}ms`,
          messageCount: conversation.messageCount + 2,
        },
      };
    }
  } catch (error) {
    console.error('Error executing user request:', error);

    return {
      success: false,
      error: error.message,
      data: {
        response: `Sorry, I encountered an error: ${error.message}`,
        conversationId: conversationId,
        executionTime: `${Date.now() - startTime}ms`,
      },
    };
  }
};

/**
 * Initiate authentication for an app
 */
export const initiateAuth = async (appName, userId) => {
  try {
    const connectionUrl = await composio.connectedAccounts.initiate(
      userId,
      appName
    );

    // Save to database
    const composioAuth = new ComposioAuth({
      userId: userId,
      authConfigId: connectionUrl.integrationId,
      connectedAccountId: connectionUrl.id,
      status: 'pending',
      integrationId: connectionUrl.integrationId,
      redirectUrl: connectionUrl.redirectUrl,
      toolkit: {
        slug: appName,
      },
    });

    await composioAuth.save();

    return {
      success: true,
      data: connectionUrl,
    };
  } catch (error) {
    console.error('Error initiating auth:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Wait for connection to complete
 */
export const waitForConnection = async (connectedAccountId) => {
  try {
    const connection =
      await composio.connectedAccounts.waitForConnection(connectedAccountId);

    // Update database
    await ComposioAuth.updateOne(
      { connectedAccountId: connectedAccountId },
      {
        status: connection.data.status,
        accessToken: connection.data.accessToken,
        refreshToken: connection.data.refreshToken,
        toolkit: connection.toolkit,
      }
    );

    return {
      success: true,
      data: connection,
    };
  } catch (error) {
    console.error('Error waiting for connection:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get user's connected accounts
 */
export const getUserConnectedAccounts = async (userId) => {
  try {
    const accounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE',
    }).lean();

    return {
      success: true,
      data: accounts,
    };
  } catch (error) {
    console.error('Error getting connected accounts:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const composioService = {
  executeUserRequest,
  initiateAuth,
  waitForConnection,
  getUserConnectedAccounts,
};
```

**Lines:** ~250 lines  
**Result:** Complete core logic in a single, understandable file

---

## Phase 3: Controllers and Routes (Day 3)

### Step 3.1: Create Controller

**Action:** Build HTTP request handlers

**File:** `composio_simple/composio.controller.js`

```javascript
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from './composio.service.js';
import { conversationService } from './composio.conversation.js';
import SubscriptionModel from '../payment/payment.model.js';

/**
 * Main chat endpoint - handles user messages and executes actions
 */
export const chatController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;

  // Validate input
  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  // Check subscription limits (optional - can be removed if not needed)
  const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
    createdAt: -1,
  });
  if (userSubscription && userSubscription.usage <= 0) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'You have reached your usage limit. Please upgrade your plan.',
    });
  }

  try {
    // Execute the request
    const result = await composioService.executeUserRequest(
      message,
      userId,
      conversationId
    );

    if (result.success) {
      logger.info(`Composio Simple: Successful execution for user ${userId}`);

      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: result.data,
      });
    } else {
      logger.error(
        `Composio Simple: Failed execution for user ${userId}: ${result.error}`
      );

      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process request',
        data: result.data,
      });
    }
  } catch (error) {
    logger.error(`Composio Simple: Error in chat controller: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An unexpected error occurred',
      data: {
        error: error.message,
      },
    });
  }
});

/**
 * Initiate app authentication
 */
export const initiateAuthController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { app_name } = req.body;

  if (!app_name) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name is required',
    });
  }

  const result = await composioService.initiateAuth(app_name, userId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Authentication initiated',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to initiate authentication',
      data: { error: result.error },
    });
  }
});

/**
 * Wait for connection completion
 */
export const waitForConnectionController = catchAsync(async (req, res) => {
  const { connected_account_id } = req.body;

  if (!connected_account_id) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Connected account ID is required',
    });
  }

  const result = await composioService.waitForConnection(connected_account_id);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Connection established',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to establish connection',
      data: { error: result.error },
    });
  }
});

/**
 * Get user's conversations
 */
export const getConversationsController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'lastActivity',
    sortOrder: parseInt(req.query.sortOrder) || -1,
  };

  const result = await conversationService.getUserConversations(
    userId,
    options
  );

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * Get specific conversation
 */
export const getConversationController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const conversation = await conversationService.getOrCreateConversation(
    userId,
    conversationId,
    ''
  );

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation retrieved successfully',
    data: conversation,
  });
});

/**
 * Get user's connected accounts
 */
export const getConnectedAccountsController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  const result = await composioService.getUserConnectedAccounts(userId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Connected accounts retrieved successfully',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve connected accounts',
      data: { error: result.error },
    });
  }
});

export const composioSimpleController = {
  chatController,
  initiateAuthController,
  waitForConnectionController,
  getConversationsController,
  getConversationController,
  getConnectedAccountsController,
};
```

**Lines:** ~200 lines  
**Result:** Clean, focused controllers with proper error handling

---

### Step 3.2: Create Routes

**Action:** Define API endpoints

**File:** `composio_simple/composio.route.js`

```javascript
import express from 'express';
import { composioSimpleController } from './composio.controller.js';
import auth from '../../middlewares/auth/auth.js'; // Adjust path as needed
import optionalAuth from '../../middlewares/auth/optionalAuth.js'; // If you have this

const router = express.Router();

// Main chat endpoint
router.post(
  '/chat',
  auth(), // Require authentication
  composioSimpleController.chatController
);

// Authentication endpoints
router.post(
  '/initiate',
  auth(),
  composioSimpleController.initiateAuthController
);

router.post(
  '/wait-for-connection',
  auth(),
  composioSimpleController.waitForConnectionController
);

// Conversation endpoints
router.get(
  '/conversations',
  auth(),
  composioSimpleController.getConversationsController
);

router.get(
  '/conversation/:conversationId',
  auth(),
  composioSimpleController.getConversationController
);

// Connected accounts
router.get(
  '/connected-accounts',
  auth(),
  composioSimpleController.getConnectedAccountsController
);

export const composioSimpleRoutes = router;
```

**Lines:** ~50 lines  
**Result:** Clear, RESTful API structure

---

## Phase 4: Integration (Day 4)

### Step 4.1: Register Routes in Main App

**Action:** Add new module to main route index

**File:** `src/app/routes/index.js`

**Find the section where routes are registered and add:**

```javascript
// Import the new simplified composio routes
import { composioSimpleRoutes } from '../modules/composio_simple/composio.route.js';

// ... existing code ...

// Register the new routes
router.use('/composio-simple', composioSimpleRoutes);

// Keep existing composio_v2 routes
router.use('/composio', composioV2Routes); // or whatever the current route is
```

**Result:** New module accessible at `/api/composio-simple/*` endpoints

---

### Step 4.2: Add Feature Flag Support (Optional but Recommended)

**Action:** Create environment variable to switch between versions

**File:** `config/index.js`

**Add:**

```javascript
export default {
  // ... existing config ...

  composio: {
    orgApiKey: process.env.COMPOSIO_API_KEY,
    useSimplified: process.env.USE_SIMPLIFIED_COMPOSIO === 'true', // Feature flag
  },

  // ... rest of config ...
};
```

**File:** `.env`

**Add:**

```bash
# Composio Configuration
USE_SIMPLIFIED_COMPOSIO=false  # Start with false, switch to true when ready
```

**Result:** Can toggle between old and new systems easily

---

### Step 4.3: Create Comparison Endpoint (Optional)

**Action:** Add endpoint to compare both systems side-by-side

**File:** `composio_simple/composio.controller.js`

**Add this controller (useful for testing):**

```javascript
/**
 * Compare both systems - useful for testing
 * This runs the same request through both systems
 */
export const compareController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message } = req.body;

  const startTime = Date.now();

  // Run simplified version
  const simpleStart = Date.now();
  const simpleResult = await composioService.executeUserRequest(
    message,
    userId
  );
  const simpleTime = Date.now() - simpleStart;

  // Run complex version (import from v2)
  const { aiClassificationService } = await import(
    '../composio_v2/aiClassification.service.js'
  );
  const complexStart = Date.now();
  const complexResult = await aiClassificationService.processUserInputService(
    message,
    { userId }
  );
  const complexTime = Date.now() - complexStart;

  // Return comparison
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Comparison completed',
    data: {
      simplified: {
        result: simpleResult,
        executionTime: `${simpleTime}ms`,
      },
      complex: {
        result: complexResult,
        executionTime: `${complexTime}ms`,
      },
      improvement: {
        timeSaved: `${complexTime - simpleTime}ms`,
        percentageFaster: `${Math.round(((complexTime - simpleTime) / complexTime) * 100)}%`,
      },
    },
  });
});
```

**And add route:**

```javascript
// In composio.route.js
router.post('/compare', auth(), composioSimpleController.compareController);
```

**Result:** Can directly compare performance and results

---

## Phase 5: Testing (Day 5)

### Step 5.1: Manual Testing Checklist

**Test each endpoint:**

#### Test 1: Authentication Flow

```bash
# 1. Initiate auth
POST http://localhost:3000/api/composio-simple/initiate
Headers: { Authorization: "Bearer <token>" }
Body: { "app_name": "gmail" }

# Expected: Returns connection URL
# Action: Open URL in browser, complete OAuth
# Note down connected_account_id from response

# 2. Wait for connection
POST http://localhost:3000/api/composio-simple/wait-for-connection
Headers: { Authorization: "Bearer <token>" }
Body: { "connected_account_id": "<id-from-step-1>" }

# Expected: Returns connection status "ACTIVE"
```

#### Test 2: Simple Single Action

```bash
# Send simple email
POST http://localhost:3000/api/composio-simple/chat
Headers: { Authorization: "Bearer <token>" }
Body: {
  "message": "Send email to test@example.com with subject 'Test' and body 'Hello'"
}

# Expected:
# - Response within 2-3 seconds
# - Success message
# - conversationId returned
# - toolsUsed: ["gmail_send_email"]
```

#### Test 3: Multi-Step Action

```bash
# GitHub + Email workflow
POST http://localhost:3000/api/composio-simple/chat
Headers: { Authorization: "Bearer <token>" }
Body: {
  "message": "Get the latest pull request from my repo 'myproject' and email it to john@example.com"
}

# Expected:
# - Response within 3-4 seconds
# - Both actions executed
# - toolsUsed: ["github_list_pull_requests", "gmail_send_email"]
# - Email contains PR information
```

#### Test 4: Conversation Memory

```bash
# First message
POST http://localhost:3000/api/composio-simple/chat
Headers: { Authorization: "Bearer <token>" }
Body: {
  "message": "List my GitHub repositories"
}

# Note the conversationId from response

# Second message (with context)
POST http://localhost:3000/api/composio-simple/chat
Headers: { Authorization: "Bearer <token>" }
Body: {
  "conversationId": "<id-from-first-message>",
  "message": "Create an issue in the first repository"
}

# Expected:
# - LLM remembers context from first message
# - Creates issue in correct repo without asking
```

#### Test 5: Get Conversations

```bash
# List conversations
GET http://localhost:3000/api/composio-simple/conversations
Headers: { Authorization: "Bearer <token>" }
Query: ?page=1&limit=20

# Expected:
# - List of user's conversations
# - Pagination info
```

#### Test 6: Get Specific Conversation

```bash
# Get conversation details
GET http://localhost:3000/api/composio-simple/conversation/<conversationId>
Headers: { Authorization: "Bearer <token>" }

# Expected:
# - Full conversation with all messages
# - Message history preserved
```

#### Test 7: Connected Accounts

```bash
# Get user's connected accounts
GET http://localhost:3000/api/composio-simple/connected-accounts
Headers: { Authorization: "Bearer <token>" }

# Expected:
# - List of connected apps (gmail, github, etc.)
# - Status for each connection
```

---

### Step 5.2: Performance Testing

**Create test script:** `composio_simple/test-performance.js`

```javascript
import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/composio-simple';
const AUTH_TOKEN = 'your-test-token-here';

const testCases = [
  {
    name: 'Simple Email',
    message: 'Send email to test@example.com saying hello',
  },
  {
    name: 'GitHub Query',
    message: 'List my GitHub repositories',
  },
  {
    name: 'Multi-Step',
    message: 'Get my latest GitHub PR and email it to test@example.com',
  },
];

async function runPerformanceTest() {
  console.log('Starting performance tests...\n');

  for (const testCase of testCases) {
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${BASE_URL}/chat`,
        { message: testCase.message },
        {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ ${testCase.name}`);
      console.log(`   Time: ${duration}ms`);
      console.log(
        `   Tools: ${response.data.data.toolsUsed?.join(', ') || 'none'}`
      );
      console.log(`   Success: ${response.data.success}`);
      console.log();
    } catch (error) {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Error: ${error.message}`);
      console.log();
    }
  }
}

runPerformanceTest();
```

**Run tests:**

```bash
node src/app/modules/composio_simple/test-performance.js
```

**Expected Results:**

- Simple actions: <2 seconds
- Multi-step actions: <4 seconds
- All tests pass

---

### Step 5.3: Comparison Testing (Optional)

**Create comparison script:** `composio_simple/compare-systems.js`

```javascript
import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = 'your-test-token-here';

async function compareSystem() {
  const testMessage = 'Send email to test@example.com with subject Hello';

  console.log('Testing Message:', testMessage);
  console.log('\n--- SIMPLIFIED SYSTEM ---');

  // Test simplified
  const simpleStart = Date.now();
  const simpleResponse = await axios.post(
    `${BASE_URL}/composio-simple/chat`,
    { message: testMessage },
    { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
  );
  const simpleTime = Date.now() - simpleStart;

  console.log('Time:', simpleTime, 'ms');
  console.log('Success:', simpleResponse.data.success);
  console.log('Tools:', simpleResponse.data.data.toolsUsed);

  console.log('\n--- COMPLEX SYSTEM (V2) ---');

  // Test complex
  const complexStart = Date.now();
  const complexResponse = await axios.post(
    `${BASE_URL}/composio/chat`,
    { message: testMessage },
    { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
  );
  const complexTime = Date.now() - complexStart;

  console.log('Time:', complexTime, 'ms');
  console.log('Success:', complexResponse.data.success);

  console.log('\n--- RESULTS ---');
  console.log('Time Saved:', complexTime - simpleTime, 'ms');
  console.log(
    'Percentage Faster:',
    Math.round(((complexTime - simpleTime) / complexTime) * 100),
    '%'
  );
}

compareSystem();
```

**Run:**

```bash
node src/app/modules/composio_simple/compare-systems.js
```

**Expected:** 70-80% performance improvement

---

## Phase 6: Rollout (Final)

### Step 6.1: Rollout Plan

**Week 1: Soft Launch**

```bash
# Enable for 10% of users (via feature flag or user IDs)
# Monitor: errors, response times, user feedback
```

**Week 2: Expand**

```bash
# Increase to 50% of users
# Compare: costs, performance, success rates
```

**Week 3: Full Migration**

```bash
# Move 100% of traffic to simplified version
# Mark composio_v2 as deprecated
```

**Week 4: Cleanup**

```bash
# After proven stable, can deprecate composio_v2
# Keep both modules for now as reference
```

---

## Summary Checklist

### ✅ Phase 1: Setup

- [ ] Created `composio_simple/` directory
- [ ] Created all files with basic structure
- [ ] Added README documentation

### ✅ Phase 2: Core Implementation

- [ ] Built conversation service (~150 lines)
- [ ] Built main service (~250 lines)
- [ ] Tested service functions work

### ✅ Phase 3: API Layer

- [ ] Created controllers (~200 lines)
- [ ] Created routes (~50 lines)
- [ ] Verified all endpoints defined

### ✅ Phase 4: Integration

- [ ] Registered routes in main app
- [ ] Added feature flag support
- [ ] Created comparison endpoint

### ✅ Phase 5: Testing

- [ ] Manual testing of all endpoints
- [ ] Performance testing
- [ ] Comparison with V2

### ✅ Phase 6: Rollout

- [ ] Soft launch completed
- [ ] Performance monitoring active
- [ ] Full migration successful

---

## Final File Structure

```
src/app/modules/composio_simple/
├── composio.conversation.js        (~150 lines)
├── composio.service.js             (~250 lines)
├── composio.controller.js          (~200 lines)
├── composio.route.js               (~50 lines)
├── test-performance.js             (~50 lines)
└── compare-systems.js              (~50 lines)

TOTAL: ~750 lines (vs 5,000+ in composio_v2)
```

---

## Key Differences from V2

| Aspect           | V2 (Complex)                | Simple                      |
| ---------------- | --------------------------- | --------------------------- |
| Files            | 25+ files                   | 6 core files                |
| Lines of Code    | 5,000+                      | ~700                        |
| LLM Calls        | 6-9 per request             | 1 per request               |
| Response Time    | 6-10 seconds                | 1-3 seconds                 |
| State Management | LangGraph with 40+ fields   | Simple conversation storage |
| Dependencies     | LangGraph, complex workflow | Composio + OpenAI only      |
| Debugging        | Very complex                | Simple linear flow          |
| Maintenance      | High effort                 | Low effort                  |

---

## Success Criteria

After implementation, you should see:

✅ **Performance:** 75% faster responses (2s vs 8s average)  
✅ **Cost:** 85% cheaper token usage ($0.02 vs $0.12 per request)  
✅ **Code:** 90% less code (700 vs 5,000+ lines)  
✅ **Reliability:** Same or better success rate  
✅ **Simplicity:** New developers understand in 1 day vs 1 week

---

## Next Steps

1. **Start with Phase 1** - Create the directory structure
2. **Implement Phase 2** - Build core service (most important)
3. **Test early and often** - Verify each component works
4. **Compare with V2** - Run side-by-side tests
5. **Rollout gradually** - Start with 10% traffic
6. **Celebrate** - You just simplified a complex system! 🎉

---

**Questions or Issues?**

Common pitfalls to avoid:

- ❌ Don't try to port all V2 features - most aren't needed
- ❌ Don't over-think the implementation - keep it simple
- ❌ Don't skip testing - verify each endpoint works
- ✅ DO trust modern LLMs to handle multi-step naturally
- ✅ DO measure and compare performance
- ✅ DO keep the old system running during migration

Good luck with the implementation!
