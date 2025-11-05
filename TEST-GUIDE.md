# Composio Simple API Test Scripts

Two test scripts to help you test the Composio Simple API endpoints.

## Files

- `test-composio-simple.js` - Main test suite with all test functions
- `test-composio-individual.js` - Individual test runner for running one test at a time

## Prerequisites

Make sure your server is running:
```bash
npm start
# or
npm run dev
```

Server should be running on: `http://localhost:5100`

## Quick Start

### Option 1: Run All Tests at Once

```bash
node test-composio-simple.js
```

This will run all tests in sequence and show you the results.

### Option 2: Run Individual Tests

1. Open `test-composio-individual.js`
2. Uncomment the test you want to run
3. Run:
```bash
node test-composio-individual.js
```

## Available Tests

### Test 1: Get Connected Accounts
```javascript
await test1_getConnectedAccounts();
```
Shows all apps you've connected (Gmail, GitHub, Slack, etc.)

### Test 2: Initiate Authentication
```javascript
await test2_initiateAuth('gmail'); // or 'github', 'slack', etc.
```
Starts OAuth flow for connecting a new app. Returns a URL to open in browser.

### Test 3: Wait for Connection
```javascript
const connectedAccountId = 'YOUR_ID_FROM_TEST2';
await test3_waitForConnection(connectedAccountId);
```
Checks if OAuth flow is complete. Run after completing OAuth in browser.

### Test 4: Simple Chat Action
```javascript
await test4_simpleChatAction('Send email to test@example.com with subject "Hello"');
```
Sends a message to execute an action. Returns conversation ID.

### Test 5: Continued Conversation
```javascript
const conversationId = 'YOUR_CONVERSATION_ID_FROM_TEST4';
await test5_continuedConversation(conversationId, 'Also send a copy to john@example.com');
```
Continues a conversation with context from previous messages.

### Test 6: Get All Conversations
```javascript
await test6_getConversations();
```
Lists all your conversations with pagination.

### Test 7: Get Specific Conversation
```javascript
const conversationId = 'YOUR_CONVERSATION_ID';
await test7_getSpecificConversation(conversationId);
```
Gets a specific conversation with all messages.

### Test 8: Compare Simplified vs V2
```javascript
await test8_compareWithV2('Send email to test@example.com');
```
Runs the same request through both simplified and V2 systems, showing performance comparison.

## Example Workflow

### Basic Flow
```bash
# 1. Check connected accounts
node test-composio-individual.js  # with test1 uncommented

# 2. Send a chat message
node test-composio-individual.js  # with test4 uncommented

# 3. View conversations
node test-composio-individual.js  # with test6 uncommented
```

### OAuth Flow (Connect New App)
```bash
# 1. Initiate OAuth
node test-composio-individual.js  # with test2 uncommented
# Copy the redirectUrl and open in browser
# Complete OAuth flow

# 2. Wait for connection (use connected_account_id from step 1)
node test-composio-individual.js  # with test3 uncommented

# 3. Verify connection
node test-composio-individual.js  # with test1 uncommented
```

### Performance Testing
```bash
# Compare simplified vs V2 performance
node test-composio-individual.js  # with test8 uncommented
```

## Test Messages Examples

### Email Actions
```javascript
await test4_simpleChatAction('Send email to john@example.com with subject "Meeting" and body "Let\'s meet tomorrow"');
```

### GitHub Actions
```javascript
await test4_simpleChatAction('List all pull requests in my repository "myproject"');
await test4_simpleChatAction('Create an issue in myproject with title "Bug fix" and description "Fix login issue"');
```

### Multi-Step Actions
```javascript
await test4_simpleChatAction('Get the latest pull request from my GitHub repo and email it to team@example.com');
```

### Slack Actions
```javascript
await test4_simpleChatAction('Send a message to #general channel saying "Deployment complete"');
```

## Understanding Results

### Success Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "response": "Email sent successfully",
    "conversationId": "composio-simple-1234567890-abc123",
    "toolsUsed": ["gmail_send_email"],
    "executionTime": "1850ms",
    "messageCount": 2
  }
}
```

### Comparison Response
```json
{
  "data": {
    "simplified": {
      "executionTime": "1850ms",
      "toolsUsed": ["gmail_send_email"]
    },
    "v2": {
      "executionTime": "8200ms"
    },
    "comparison": {
      "timeSaved": "6350ms",
      "percentageFaster": "77%",
      "simplifiedWon": true,
      "improvement": "Simplified is 6350ms (77%) faster"
    }
  }
}
```

## Customization

### Change Base URL
Edit `test-composio-simple.js` line 4:
```javascript
const BASE_URL = 'http://your-server:port/api';
```

### Change Auth Token
Edit `test-composio-simple.js` line 5:
```javascript
const AUTH_TOKEN = 'your-new-token';
```

### Modify Test Messages
Each test function accepts custom messages:
```javascript
await test4_simpleChatAction('Your custom message here');
await test8_compareWithV2('Your comparison message');
```

## Troubleshooting

### Error: Connection Refused
- Make sure server is running: `npm start`
- Check if BASE_URL is correct

### Error: 401 Unauthorized
- Token might be expired
- Generate new token and update in `test-composio-simple.js`

### Error: No connected accounts
- Run test2 to initiate OAuth
- Complete OAuth flow in browser
- Run test3 to verify connection

### Test hangs or times out
- Check server logs for errors
- Verify Composio API key is valid in .env
- Check OpenAI API key is valid in .env

## Tips

1. **Start Simple**: Run test1 first to see what accounts are connected
2. **One at a Time**: Test individual endpoints before running full suite
3. **Save IDs**: Copy conversation IDs and connected account IDs for later use
4. **Check Logs**: Look at server console for detailed logs
5. **Compare Performance**: Use test8 to verify the simplified version is faster

## Next Steps After Testing

1. If tests pass, update `.env`: `USE_SIMPLIFIED_COMPOSIO=true`
2. Monitor performance in production
3. Gradually rollout to more users
4. Eventually deprecate V2 module

## Support

If you encounter issues:
1. Check server logs
2. Verify API keys in `.env`
3. Make sure all connected accounts are active
4. Check network connectivity
