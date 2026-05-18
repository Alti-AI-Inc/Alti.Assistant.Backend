# Creative Writing API - Testing Guide

## Prerequisites

- Server running on `http://localhost:5000`
- Postman or cURL installed
- Optional: Authentication token for authenticated endpoints

## Test Scenarios

### Scenario 1: Basic Poem Creation

**Test:** Create a simple poem

**Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a short poem about stars"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Response contains a poem
- ✅ conversationId is returned
- ✅ writingType is "poem"

---

### Scenario 2: Story with Specific Requirements

**Test:** Create a story with style and word count

**Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a mysterious short story about a hidden treasure, around 200 words"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Response contains a story
- ✅ Story has mysterious tone
- ✅ Approximately 200 words
- ✅ writingType detected as "short_story"
- ✅ style detected as "mysterious"

---

### Scenario 3: Conversation Continuation

**Test:** Continue an existing conversation

**Step 1:** Create initial content

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a story about a robot learning emotions"
  }'
```

**Step 2:** Continue the story (save conversationId from Step 1)

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Continue the story. What happens when the robot meets a human?",
    "conversationId": "CONVERSATION_ID_FROM_STEP_1"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Continuation maintains context
- ✅ Same conversationId returned
- ✅ Story flows naturally from previous content

---

### Scenario 4: Revision Request

**Test:** Revise existing content

**Step 1:** Create initial content

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a poem about rain"
  }'
```

**Step 2:** Request revision

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Revise it to make it more melancholic and dramatic",
    "conversationId": "CONVERSATION_ID_FROM_STEP_1"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Revised version has melancholic tone
- ✅ More dramatic style applied
- ✅ intent detected as "revise"

---

### Scenario 5: Multiple Writing Types

**Test 5a: Song Lyrics**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write uplifting song lyrics about dreams"
  }'
```

**Test 5b: Haiku**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a haiku about summer"
  }'
```

**Test 5c: Script Scene**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a dramatic script scene between two friends arguing"
  }'
```

**Expected Results:**

- ✅ Each returns appropriate writing type
- ✅ Format matches the requested type
- ✅ writingType correctly detected

---

### Scenario 6: Idea Generation

**Test:** Get creative ideas

**Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Give me ideas for science fiction short stories"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Response contains multiple ideas
- ✅ intent detected as "get_ideas" or "brainstorm"
- ✅ Ideas are relevant to science fiction

---

### Scenario 7: Vague Request Handling

**Test:** System asks for clarification

**Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write something creative"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ needsClarification: true
- ✅ Response asks what type of writing
- ✅ Conversation ID created for follow-up

---

### Scenario 8: Get Conversation History (Authenticated)

**Test:** Retrieve full conversation

**Request:**

```bash
curl -X GET http://localhost:5000/api/v1/creative-writing/conversation/CONVERSATION_ID \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Full message history returned
- ✅ Metadata includes writing types used
- ✅ Timestamps present for all messages

---

### Scenario 9: Error Handling

**Test 9a: Missing Message**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result:**

- ✅ Status: 400 Bad Request
- ✅ Error message: "Message is required"

**Test 9b: Invalid Conversation ID**

```bash
curl -X GET http://localhost:5000/api/v1/creative-writing/conversation/invalid_id \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Expected Result:**

- ✅ Status: 404 Not Found
- ✅ Error message: "Conversation not found"

---

### Scenario 10: Guest User Support

**Test:** Use without authentication

**Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a haiku about nature"
  }'
```

**Expected Result:**

- ✅ Status: 200 OK
- ✅ Works without auth token
- ✅ Guest userId generated
- ✅ Response includes writing content

---

## Postman Testing

### Import Collection

1. Open Postman
2. Click "Import"
3. Select file: `postman_collections/Creative_Writing_API.postman_collection.json`
4. Collection imported with 12 pre-configured requests

### Configure Variables

Set these collection variables:

- `baseUrl`: `http://localhost:5000/api/v1`
- `authToken`: Your JWT token (for authenticated tests)
- `conversationId`: Will be auto-populated from responses

### Run Tests

1. **Single Request:** Click on any request → Send
2. **Collection Runner:** Run all tests sequentially
3. **Save conversationId:** Copy from response and paste into next request

### Pre-configured Requests

1. ✅ Create a Poem
2. ✅ Create a Short Story
3. ✅ Continue Story
4. ✅ Write Song Lyrics
5. ✅ Write a Script Scene
6. ✅ Write a Haiku
7. ✅ Write Flash Fiction
8. ✅ Revise Writing
9. ✅ Expand Writing
10. ✅ Brainstorm Ideas
11. ✅ Write Creative Essay
12. ✅ Write Free Verse Poem

---

## Validation Checklist

### ✅ Functional Tests

- [ ] All writing types work correctly
- [ ] Style detection works
- [ ] Tone detection works
- [ ] Word count constraints respected
- [ ] Conversation continuity maintained
- [ ] Revision requests handled properly
- [ ] Expansion works correctly
- [ ] Idea generation provides multiple ideas

### ✅ Edge Cases

- [ ] Vague requests trigger clarification
- [ ] Very long messages (up to 5000 chars) work
- [ ] Empty conversation ID handled
- [ ] Invalid conversation ID returns 404
- [ ] Missing message returns 400

### ✅ Authentication

- [ ] Guest users can access endpoint
- [ ] Authenticated users can access endpoint
- [ ] Only authenticated users can get history
- [ ] Invalid tokens rejected

### ✅ Performance

- [ ] Responses within 10 seconds
- [ ] Handles concurrent requests
- [ ] Memory usage reasonable
- [ ] No crashes on errors

### ✅ Integration

- [ ] Conversations stored in database
- [ ] Messages saved correctly
- [ ] Metadata updated properly
- [ ] Writing history tracked

---

## Common Issues & Solutions

### Issue 1: Connection Refused

**Solution:** Ensure server is running on port 5000

### Issue 2: 401 Unauthorized

**Solution:** Include valid JWT token in Authorization header

### Issue 3: Slow Response

**Solution:** Normal for AI generation (5-10 seconds), check Gemini API status

### Issue 4: Empty Response

**Solution:** Check Gemini API key configuration in environment variables

### Issue 5: Conversation Not Found

**Solution:** Verify conversationId exists and belongs to user

---

## Performance Benchmarks

Expected response times:

- Simple poem: 3-5 seconds
- Short story: 5-8 seconds
- Long-form content: 8-12 seconds
- Revisions: 4-7 seconds
- Ideas: 3-5 seconds

---

## Test Data Examples

### Good Test Messages

```json
"Write a romantic poem about sunset"
"Tell me a funny story about a cat, 300 words"
"Write song lyrics about hope and perseverance"
"Create a haiku about winter"
"Give me ideas for mystery stories"
"Continue the story with more action"
"Revise it to be more dramatic"
"Expand with more character details"
```

### Edge Case Messages

```json
"Write something"  // Should ask for clarification
"aaaa aaaa aaaa"  // Random text, should still attempt
""  // Empty, should return validation error
"[5000 character message]"  // Max length test
```

---

## Automation Script Example

```javascript
const axios = require('axios');

async function testCreativeWriting() {
  const baseURL = 'http://localhost:5000/api/v1/creative-writing/assistant';

  // Test 1: Create poem
  const response1 = await axios.post(baseURL, {
    message: 'Write a poem about the moon',
  });
  console.log(
    'Test 1:',
    response1.data.data.writingParams.writingType === 'poem' ? 'PASS' : 'FAIL'
  );

  const conversationId = response1.data.data.conversationId;

  // Test 2: Continue
  const response2 = await axios.post(baseURL, {
    message: 'Make it more romantic',
    conversationId,
  });
  console.log(
    'Test 2:',
    response2.data.data.conversationId === conversationId ? 'PASS' : 'FAIL'
  );
}

testCreativeWriting();
```

---

## Support

If tests fail:

1. Check server logs
2. Verify environment variables
3. Confirm Gemini API access
4. Review error messages
5. Contact development team

---

## Next Steps After Testing

1. ✅ Fix any discovered bugs
2. ✅ Optimize slow endpoints
3. ✅ Add additional test cases
4. ✅ Performance tune if needed
5. ✅ Document any limitations
6. ✅ Prepare for production deployment
