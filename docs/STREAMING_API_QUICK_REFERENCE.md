# Streaming Search API - Quick Reference

## Endpoint

```
POST /api/v1/search/stream
```

## Headers

```
Content-Type: application/json
Accept: text/event-stream
```

## Request Body

```json
{
  "message": "Your search query here",
  "conversationId": "optional_conversation_id"
}
```

## Response Format (SSE)

### 1. Connected
```json
data: {"type":"connected","conversationId":"search_xxx","timestamp":1702345678901}
```

### 2. Thinking (Multiple)
```json
data: {"type":"thinking","content":"Model's reasoning...","timestamp":1702345678902}
```

### 3. Text (Multiple)
```json
data: {"type":"text","content":"Response chunk...","timestamp":1702345678903}
```

### 4. Metadata
```json
data: {"type":"metadata","reference":[...],"citations":[...],"citationMetadata":{...},"timestamp":1702345678904}
```

### 5. Done
```json
data: {"type":"done","conversationId":"search_xxx","messageCount":2,"userType":"guest","timestamp":1702345678905}
```

## Quick Test (cURL)

```bash
curl -N -X POST http://localhost:5000/api/v1/search/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"What is the weather in Detroit?"}'
```

## Quick Test (JavaScript)

```javascript
const eventSource = new EventSource('http://localhost:5000/api/v1/search/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);
  
  if (data.type === 'done') {
    eventSource.close();
  }
};
```

## Event Processing Order

```
connected → thinking* → text* → metadata → done
           ↓
         (error - if something fails)
```

*Multiple events may be sent

## Key Features

✅ Real-time streaming  
✅ Visible thinking process  
✅ Progressive response display  
✅ Source citations  
✅ Conversation continuity  
✅ Automatic retries (3 attempts)  
✅ Error handling with graceful fallback
