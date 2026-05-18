# Creative Writing Module - Quick Start Guide

## Overview

The Creative Writing module provides an AI-powered conversational assistant for creating various forms of creative content. Simply describe what you want to write, and the AI will generate it for you!

## Quick Start (3 Steps)

### 1. Start a Creative Writing Session

**Endpoint:** `POST /api/v1/creative-writing/assistant`

**Basic Request:**

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a poem about the ocean"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "conversationId": "creative_1234567890_abc",
    "response": "[Your generated poem here]",
    "writingParams": {
      "writingType": "poem"
    }
  }
}
```

### 2. Continue the Conversation

Use the `conversationId` from the previous response to continue:

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Make it more dramatic",
    "conversationId": "creative_1234567890_abc"
  }'
```

### 3. View History (Authenticated Users)

```bash
curl -X GET http://localhost:5000/api/v1/creative-writing/conversation/creative_1234567890_abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Use Cases

### Write Different Types of Creative Content

#### Poem

```json
{
  "message": "Write a poem about autumn leaves"
}
```

#### Short Story

```json
{
  "message": "Write a short mystery story about a detective, around 500 words"
}
```

#### Song Lyrics

```json
{
  "message": "Write song lyrics about hope and new beginnings"
}
```

#### Script Scene

```json
{
  "message": "Write a dramatic scene between two friends arguing"
}
```

#### Haiku

```json
{
  "message": "Write a haiku about cherry blossoms"
}
```

#### Flash Fiction

```json
{
  "message": "Write a 100-word flash fiction about time travel"
}
```

### Specify Style and Tone

```json
{
  "message": "Write a romantic and melancholic poem about lost love"
}
```

```json
{
  "message": "Write a funny story about a cat who thinks it's a dog"
}
```

```json
{
  "message": "Write a dark and mysterious short story"
}
```

### Control Length

```json
{
  "message": "Write a 300-word story about adventure"
}
```

```json
{
  "message": "Write a very short poem, just 4 lines"
}
```

### Iterate on Writing

#### Continue

```json
{
  "message": "Continue the story. What happens next?",
  "conversationId": "creative_xxx"
}
```

#### Revise

```json
{
  "message": "Revise it to make it more suspenseful",
  "conversationId": "creative_xxx"
}
```

#### Expand

```json
{
  "message": "Expand the story with more details about the characters",
  "conversationId": "creative_xxx"
}
```

#### Shorten

```json
{
  "message": "Make it shorter and more concise",
  "conversationId": "creative_xxx"
}
```

### Get Ideas

```json
{
  "message": "Give me ideas for science fiction short stories"
}
```

```json
{
  "message": "Suggest topics for romantic poems"
}
```

## Tips for Best Results

### ✅ DO:

- Be specific about what you want
- Mention style, tone, and length preferences
- Use natural language - talk to it like a person
- Save the conversationId for follow-up requests
- Iterate on your writing - ask for revisions

### ❌ DON'T:

- Don't be too vague (e.g., just "write something")
- Don't forget to pass conversationId when continuing
- Don't expect perfect first drafts - iterate!

## Example Conversation Flow

**User:** "Write a short story about a robot learning to feel emotions"

**AI:** [Generates initial story]

**User:** "Make it more heartwarming and add more dialogue"  
_(Include conversationId)_

**AI:** [Generates revised version]

**User:** "Perfect! Now continue it - what happens when the robot meets a human?"  
_(Include conversationId)_

**AI:** [Continues the story]

## Postman Testing

Import the Postman collection for ready-to-use examples:

**File:** `postman_collections/Creative_Writing_API.postman_collection.json`

The collection includes:

- ✅ Poem creation examples
- ✅ Story writing examples
- ✅ Song lyrics examples
- ✅ Script writing examples
- ✅ Haiku and other poetry forms
- ✅ Revision and continuation examples
- ✅ Idea generation examples

## Authentication

### Guest Users (No Auth Required)

```bash
# Just send the request - no token needed
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a poem"}'
```

### Authenticated Users

```bash
# Include your auth token
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message": "Write a poem"}'
```

## Response Structure

Every response includes:

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "creative_1234567890_abc",
    "response": "[Generated creative writing]",
    "writingParams": {
      "writingType": "poem",
      "style": "romantic",
      "intent": "create_new",
      "wordCount": null
    },
    "analysis": {
      "intent": "create_new",
      "writingType": "poem",
      "originalMessage": "Write a poem..."
    },
    "needsClarification": false
  }
}
```

## Error Handling

| Status Code | Meaning       | Solution                            |
| ----------- | ------------- | ----------------------------------- |
| 400         | Bad Request   | Check message is provided and valid |
| 401         | Unauthorized  | Include valid auth token            |
| 403         | Limit Reached | Upgrade subscription plan           |
| 500         | Server Error  | Contact support                     |

## Need Help?

- 📖 Full documentation: See `README.md`
- 🔧 Postman collection: `Creative_Writing_API.postman_collection.json`
- 💬 Questions: Contact the development team

## Next Steps

1. ✅ Import the Postman collection
2. ✅ Try the basic examples above
3. ✅ Experiment with different writing types
4. ✅ Practice iterating on your writing
5. ✅ Integrate into your application

Happy writing! 🎨✨
