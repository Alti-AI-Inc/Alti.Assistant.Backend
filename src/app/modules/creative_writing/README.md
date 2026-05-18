# Creative Writing API

A conversational AI-powered creative writing assistant that helps users create various forms of creative content including poems, stories, scripts, song lyrics, and more.

## Features

- 🎭 **Multiple Writing Types**: Supports poems, short stories, scripts, song lyrics, essays, flash fiction, haikus, sonnets, and more
- 💬 **Conversational Interface**: Natural language interaction - just describe what you want to write
- 🎨 **Style Customization**: Various writing styles (dramatic, romantic, comedic, mysterious, etc.)
- 🎵 **Tone Control**: Multiple tone options (joyful, melancholic, hopeful, nostalgic, etc.)
- 📝 **Word Count Control**: Specify target word counts for precise length requirements
- 🔄 **Iterative Refinement**: Continue, revise, expand, or modify your writing in conversation
- 💡 **Idea Generation**: Get creative writing ideas and brainstorm concepts
- 👥 **Multi-User Support**: Supports both authenticated users and guests
- 💾 **Conversation History**: Maintains context across multiple interactions

## Supported Writing Types

| Type              | Description                                         |
| ----------------- | --------------------------------------------------- |
| **Poem**          | Various poetic forms with vivid imagery and emotion |
| **Short Story**   | Complete narratives with characters and plot        |
| **Novel Chapter** | Extended narrative segments for longer works        |
| **Essay**         | Creative personal or reflective essays              |
| **Script**        | Dramatic scenes with dialogue and stage directions  |
| **Song Lyrics**   | Lyrical content with verses, choruses, and hooks    |
| **Dialogue**      | Natural conversations between characters            |
| **Flash Fiction** | Ultra-short stories with impact                     |
| **Haiku**         | Traditional 5-7-5 syllable Japanese poetry          |
| **Sonnet**        | 14-line poems with structured rhyme schemes         |
| **Free Verse**    | Poetry without traditional structure                |
| **Monologue**     | Single-character dramatic speeches                  |
| **Letter**        | Creative correspondence                             |

## API Endpoints

### 1. Conversational Assistant

**Endpoint:** `POST /api/v1/creative-writing/assistant`

The main endpoint for interacting with the creative writing assistant.

**Request Body:**

```json
{
  "message": "Write a romantic poem about moonlight",
  "conversationId": "optional-conversation-id"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "success": true,
    "conversationId": "creative_1234567890_abc123",
    "response": "Under silver moonlight gleaming bright...",
    "writingParams": {
      "writingType": "poem",
      "style": "romantic",
      "intent": "create_new"
    },
    "analysis": {
      "intent": "create_new",
      "writingType": "poem",
      "style": "romantic"
    }
  }
}
```

### 2. Get Conversation History

**Endpoint:** `GET /api/v1/creative-writing/conversation/:conversationId`

**Headers:**

- `Authorization: Bearer <token>` (required for authenticated users)

**Response:**

```json
{
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversationId": "creative_1234567890_abc123",
    "title": "Creative Writing: Write a romantic poem...",
    "messages": [
      {
        "role": "user",
        "content": "Write a romantic poem about moonlight",
        "timestamp": "2025-12-29T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Under silver moonlight gleaming bright...",
        "timestamp": "2025-12-29T10:00:05Z",
        "metadata": {
          "writingType": "poem",
          "style": "romantic"
        }
      }
    ],
    "metadata": {
      "category": "creative_writing",
      "model": "gemini-2.5-flash",
      "writingHistory": []
    }
  }
}
```

## Usage Examples

### Example 1: Create a Simple Poem

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a short poem about autumn leaves"
  }'
```

### Example 2: Create a Story with Specific Style

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a mysterious short story about a hidden door, around 300 words"
  }'
```

### Example 3: Continue an Existing Story

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Continue the story. What happens when they open the door?",
    "conversationId": "creative_1234567890_abc123"
  }'
```

### Example 4: Revise Writing

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Revise the poem to make it more melancholic",
    "conversationId": "creative_1234567890_abc123"
  }'
```

### Example 5: Write Song Lyrics

```bash
curl -X POST http://localhost:5000/api/v1/creative-writing/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write uplifting song lyrics about overcoming challenges"
  }'
```

## Natural Language Understanding

The API intelligently understands various ways of expressing creative writing requests:

### Writing Type Detection

- "Write a **poem**" → Poem
- "Tell me a **story**" → Short Story
- "Create **lyrics**" → Song Lyrics
- "Write a **haiku**" → Haiku
- "Make a **script**" → Script

### Intent Detection

- "Write", "Create", "Make" → Create New
- "Continue", "What happens next" → Continue Story
- "Revise", "Improve", "Make it better" → Revise
- "Expand", "Add more details" → Expand
- "Make it shorter", "Condense" → Shorten
- "Give me ideas", "Suggest" → Brainstorm

### Style & Tone Detection

- "romantic", "love" → Romantic style
- "funny", "comedic" → Comedic style
- "mysterious", "suspense" → Mysterious style
- "dark", "grim" → Dark style
- "joyful", "happy" → Joyful tone
- "sad", "melancholic" → Melancholic tone

## Configuration

Key configuration settings in `creative_writing.constant.js`:

```javascript
export const CREATIVE_WRITING_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  TEMPERATURE: 0.9, // High temperature for creativity
  MAX_OUTPUT_TOKENS: 8192,
};
```

## Module Structure

```
creative_writing/
├── creative_writing.constant.js    # Configuration and constants
├── creative_writing.service.js     # Core business logic
├── creative_writing.controller.js  # Request handlers
├── creative_writing.route.js       # Route definitions
└── creative_writing.validation.js  # Request validation schemas
```

## Authentication

- **Authenticated Users**: Include JWT token in Authorization header
- **Guest Users**: No authentication required (limited functionality)
- **Rate Limiting**: 30 requests per 15 minutes (configurable)

## Error Handling

The API returns standard HTTP status codes:

- `200 OK`: Successful request
- `400 BAD REQUEST`: Invalid request parameters
- `401 UNAUTHORIZED`: Missing or invalid authentication
- `403 FORBIDDEN`: Subscription limit reached
- `404 NOT FOUND`: Conversation not found
- `500 INTERNAL SERVER ERROR`: Server error

## Best Practices

1. **Be Specific**: Provide clear descriptions of what you want to create
2. **Use Conversation ID**: Maintain context by passing conversationId for follow-ups
3. **Iterate Naturally**: Ask for revisions, continuations, or changes conversationally
4. **Specify Constraints**: Mention word counts, style preferences, and tone when needed
5. **Save Conversation IDs**: Store conversationId to access writing history later

## Postman Collection

A complete Postman collection is available at:
`postman_collections/Creative_Writing_API.postman_collection.json`

Import this collection to test all endpoints with pre-configured examples.

## Technical Details

### AI Model

- **Model**: Google Gemini 2.5 Flash
- **Temperature**: 0.9 (high creativity)
- **Max Tokens**: 8192

### Conversation Management

- Conversations are stored in MongoDB
- Full message history maintained
- Writing history tracked in metadata
- Support for guest and authenticated users

### Message Analysis

The system analyzes each user message to:

- Detect writing intent (create, continue, revise, etc.)
- Identify writing type (poem, story, script, etc.)
- Extract style and tone preferences
- Parse word count requirements
- Determine if clarification is needed

## Integration Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

async function createPoem(message) {
  const response = await axios.post(
    'http://localhost:5000/api/v1/creative-writing/assistant',
    { message },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data.data;
}

// Usage
const result = await createPoem('Write a haiku about spring');
console.log(result.response);
```

### Python

```python
import requests

def create_story(message, conversation_id=None):
    payload = {
        'message': message,
        'conversationId': conversation_id
    }

    response = requests.post(
        'http://localhost:5000/api/v1/creative-writing/assistant',
        json=payload
    )

    return response.json()['data']

# Usage
result = create_story('Write a short mystery story')
print(result['response'])
```

## Future Enhancements

- [ ] Support for collaborative writing
- [ ] Writing templates and frameworks
- [ ] Export to various formats (PDF, DOCX, etc.)
- [ ] Writing style analysis and recommendations
- [ ] Integration with grammar checking tools
- [ ] Multiple language support
- [ ] Voice input for creative writing
- [ ] Writing contests and challenges

## Support

For issues, questions, or feature requests, please contact the development team or open an issue in the repository.

## License

This module is part of the ASON Core Service Backend and follows the same license terms.
