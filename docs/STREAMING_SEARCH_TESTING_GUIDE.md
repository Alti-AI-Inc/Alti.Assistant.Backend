# Testing Streaming Search with Postman

This guide shows you how to test the new streaming search endpoint that displays Gemini's thinking process in real-time.

## 🚀 Quick Start

### Step 1: Import the Collection

1. Open Postman
2. Click **Import** button (top left)
3. Navigate to: `postman_collections/Streaming_Search_API.postman_collection.json`
4. Click **Import**

### Step 2: Set Base URL

The collection uses a variable for the base URL:

1. Click on the collection name "**Streaming Search API**"
2. Go to the **Variables** tab
3. Set `base_url` to: `http://localhost:5000/api/v1` (or your server URL)
4. Click **Save**

### Step 3: Test Your First Streaming Request

1. Open the request: **Simple Query - Stream with Thinking**
2. Click **Send**
3. Watch the response stream in real-time! 🎉

## 📊 Understanding the Streaming Response

When you send a request to `/search/stream`, you'll receive a **Server-Sent Events (SSE)** stream with multiple event types:

### Event Types

#### 1. `connected` Event

```json
{
  "type": "connected",
  "conversationId": "search_1234567890_abc",
  "timestamp": 1702345678901
}
```

- First event received
- Confirms connection established
- Provides `conversationId` for follow-up queries

#### 2. `thinking` Events

```json
{
  "type": "thinking",
  "content": "I need to search for current weather data for Detroit...",
  "timestamp": 1702345678902
}
```

- Shows the model's internal realtiing process
- Multiple thinking events may be sent
- Helps understand how the model approaches the query

#### 3. `text` Events

```json
{
  "type": "text",
  "content": "The current weather in Detroit is ",
  "timestamp": 1702345678903
}
```

- Actual response content
- Sent in chunks as they're generated
- Concatenate all text chunks for the full answer

#### 4. `metadata` Event

```json
{
  "type": "metadata",
  "reference": [
    {
      "url": "https://weather.com/...",
      "domain": "weather.com",
      "title": "Detroit Weather"
    }
  ],
  "citations": [...],
  "citationMetadata": {
    "searchQueries": ["detroit weather current"],
    "model": "gemini-3-pro-preview",
    "totalSources": 5
  },
  "timestamp": 1702345678904
}
```

- Sent after all text chunks
- Contains source references and citations
- Includes search metadata

#### 5. `done` Event

```json
{
  "type": "done",
  "conversationId": "search_1234567890_abc",
  "messageCount": 2,
  "userType": "guest",
  "timestamp": 1702345678905
}
```

- Final event
- Signals completion
- Provides conversation statistics

#### 6. `error` Event (if error occurs)

```json
{
  "type": "error",
  "error": "Error message here",
  "conversationId": "search_1234567890_abc",
  "timestamp": 1702345678906
}
```

## 🧪 Test Scenarios

### Scenario 1: Simple Factual Query

**Request:**

```json
{
  "message": "What is the weather in Detroit today?"
}
```

**Expected Flow:**

1. `connected` → Connection established
2. `thinking` → "I need to search for current weather data..."
3. `text` (multiple) → Weather information chunks
4. `metadata` → Weather source citations
5. `done` → Completion

**What to Observe:**

- Quick response time
- Minimal thinking (simple query)
- Clear, concise answer with sources

---

### Scenario 2: Sports Schedule Query

**Request:**

```json
{
  "message": "When is the next Detroit Red Wings home game?"
}
```

**Expected Flow:**

1. `connected`
2. `thinking` → "I'll search for the Red Wings schedule..."
3. `thinking` → "Need to verify if this is a home game..."
4. `text` (multiple) → Date, time, and opponent
5. `metadata` → NHL.com, ESPN sources
6. `done`

**What to Observe:**

- Multiple thinking events (verification process)
- Specific date + time + opponent format
- Official sports sources in citations

---

### Scenario 3: Complex Investment Query

**Request:**

```json
{
  "message": "Should I invest in Bitcoin right now? Give me a clear answer."
}
```

**Expected Flow:**

1. `connected`
2. `thinking` → "I need to analyze current Bitcoin market data..."
3. `thinking` → "Let me search for expert opinions..."
4. `thinking` → "Checking recent price trends..."
5. `text` (many) → Market analysis
6. `metadata` → Financial news sources
7. `done`

**What to Observe:**

- Extensive thinking process (complex analysis)
- Multiple search queries in metadata
- Data-driven conclusion with sources

---

### Scenario 4: Conversation Continuation

**First Request:**

```json
{
  "message": "What is the capital of France?"
}
```

**Follow-up Request:**

```json
{
  "message": "Tell me more about its history",
  "conversationId": "search_1234567890_abc"
}
```

**What to Observe:**

- Context awareness (knows "it" refers to Paris)
- Same `conversationId` maintained
- Incremented `messageCount`

## 🔍 Viewing Streaming Responses in Postman

Postman displays SSE streams in a special format:

### In Postman Desktop:

1. Send the request
2. Click on the **Stream** tab (if available)
3. Events will appear line by line as they arrive
4. Each event starts with `data: ` prefix

### Raw Format:

```
data: {"type":"connected","conversationId":"search_1234567890_abc","timestamp":1702345678901}

data: {"type":"thinking","content":"I need to search...","timestamp":1702345678902}

data: {"type":"text","content":"The weather...","timestamp":1702345678903}

data: {"type":"done","conversationId":"search_1234567890_abc","timestamp":1702345678905}
```

### Tips for Better Viewing:

- Use **Postman Desktop** (better SSE support than web version)
- Enable **Stream** view for cleaner display
- Copy response to JSON formatter to analyze structure

## 🆚 Comparison: Streaming vs Non-Streaming

### Test Both Endpoints:

**Streaming:** `POST /search/stream`

- ✅ Real-time thinking visible
- ✅ Progressive response display
- ✅ Better user experience
- ⚠️ Requires SSE-compatible clients

**Non-Streaming:** `POST /search/assistant`

- ✅ Simple JSON response
- ✅ Works with all clients
- ⚠️ No thinking visibility
- ⚠️ Wait for complete response

### Side-by-Side Test:

1. Send same query to both endpoints
2. Compare response times
3. Analyze thinking logs (only in streaming)
4. Check citation quality

## 🐛 Troubleshooting

### Issue: No Response Received

**Symptoms:** Request hangs, no events received

**Solutions:**

- Verify server is running: `npm run dev`
- Check server logs for errors
- Ensure base URL is correct
- Try non-streaming endpoint first to verify API is working

---

### Issue: Partial Response Only

**Symptoms:** Receive `connected` but then nothing

**Solutions:**

- Check server console for "empty STOP response" logs
- This triggers automatic retry (3 attempts)
- Wait up to 30 seconds for retries
- If persists, check Gemini API key validity

---

### Issue: SSE Format Not Readable

**Symptoms:** Raw `data: {...}` lines instead of parsed events

**Solutions:**

- Use **Postman Desktop** (better SSE support)
- Switch to **Stream** tab in response viewer
- Copy response and use JSON formatter for manual parsing

---

### Issue: `conversationId` Not Working

**Symptoms:** Follow-up queries don't maintain context

**Solutions:**

- Verify you're using exact `conversationId` from first response
- Check `connected` event for correct ID format
- Ensure first query completed successfully (`done` event received)

## 📈 Performance Metrics to Track

When testing, monitor these metrics:

1. **Time to First Byte (TTFB)**

   - `connected` event timestamp vs request time
   - Should be < 500ms

2. **Thinking Duration**

   - Time between `thinking` events
   - Complex queries: 2-5 seconds
   - Simple queries: < 1 second

3. **Text Streaming Rate**

   - Frequency of `text` events
   - Should feel "live" and continuous

4. **Total Response Time**

   - `connected` to `done` event
   - Simple queries: 3-8 seconds
   - Complex queries: 10-20 seconds

5. **Retry Frequency**
   - Check server logs for retry messages
   - Should be rare (< 5% of requests)

## 🎯 Best Practices

1. **Always include `Accept: text/event-stream` header**

   - Already configured in collection
   - Required for proper SSE handling

2. **Save conversationId for follow-ups**

   - Copy from `connected` or `done` events
   - Store in Postman environment variable for easy reuse

3. **Test with varied query complexity**

   - Simple: "What time is it in Tokyo?"
   - Medium: "Compare Python and JavaScript"
   - Complex: "Analyze cryptocurrency market trends"

4. **Monitor server console alongside Postman**

   - See thinking logs in real-time
   - Identify retry attempts
   - Debug issues more effectively

5. **Compare with non-streaming endpoint**
   - Validate answer quality is identical
   - Confirm all references are included
   - Check for any streaming-specific issues

## 🔗 Related Endpoints

The collection includes comparison requests:

- **`/search/assistant`** - Native grounding (non-streaming)
- **`/search/assistant_v2`** - Full research agent (non-streaming)
- **`/search/stream`** - Streaming with thinking (NEW!)

Test all three with the same query to compare behavior.

## 📝 Example Test Session

Here's a complete test workflow:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Watch logs
tail -f logs/combined.log
```

**In Postman:**

1. **Send:** "What is Bitcoin's current price?"

   - Note `conversationId` from response
   - Observe thinking events
   - Verify price and sources

2. **Send:** "Should I buy it?" + saved `conversationId`

   - Confirm context maintained
   - Watch investment analysis thinking
   - Check data-driven conclusion

3. **Send:** "What about Ethereum instead?"

   - No `conversationId` (new conversation)
   - Compare analysis quality

4. **Compare:** Send same queries to `/search/assistant`
   - Validate identical answer quality
   - Note lack of thinking visibility

## ✅ Success Criteria

Your streaming endpoint is working correctly if:

- ✅ All event types received in correct order
- ✅ Thinking events show meaningful realtiing
- ✅ Text chunks concatenate to coherent answer
- ✅ Metadata includes valid source URLs
- ✅ `done` event always received
- ✅ Errors trigger `error` event (not silent failure)
- ✅ Conversation continuity works with `conversationId`
- ✅ Response quality matches non-streaming endpoint

---

## 🎉 You're Ready!

You now have everything you need to test the streaming search endpoint. Start with the simple weather query and work your way up to complex investment analysis.

**Happy Testing! 🚀**
