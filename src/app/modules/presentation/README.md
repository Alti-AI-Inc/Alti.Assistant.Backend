# Presentation Module

AI-powered conversational presentation generation module that integrates with Presenton API.

## Features

### 🤖 Conversational AI Assistant
- Natural language understanding for presentation requests
- Intelligent parameter extraction from user messages
- Context-aware follow-up questions when information is missing
- Maintains conversation history for seamless interactions

### 🎨 Presentation Generation
- **Synchronous Generation**: Instant presentation creation
- **Asynchronous Generation**: For large or complex presentations
- **Template Support**: general, modern, standard, swift
- **Theme Support**: edge-yellow, mint-blue, light-rose, professional-blue, professional-dark
- **Customization Options**:
  - Tone: default, casual, professional, funny, educational, sales_pitch
  - Verbosity: concise, standard, text-heavy
  - Image Type: stock, ai-generated
  - Number of slides: 1-50
  - Language: Multiple languages supported
  - Web Search: Real-time information integration
  - Table of Contents: Optional TOC slide
  - Title Slide: Customizable cover slide

### ✏️ Presentation Editing
- **Edit Existing**: Modify slides in an existing presentation
- **Derive New**: Create a new presentation from an existing one
- **Slide-level Control**: Update specific slides by index
- **Complex Data**: Support for charts, bullets, and custom content

### 📊 Task Management
- Check status of async generation tasks
- Retrieve presentation details
- Download and edit URLs

## API Endpoints

### 1. Conversational Assistant (Main Endpoint)
```
POST /api/presentation/assistant
```

**Purpose**: Natural language interface for all presentation operations

**Request Body**:
```json
{
  "message": "Create a professional presentation about Machine Learning with 10 slides",
  "conversationId": "optional-conversation-id",
  "userId": "optional-user-id-for-guests"
}
```

**Example Conversations**:

**Simple Generation**:
```
User: "Create a presentation about climate change"
Assistant: "I'd be happy to help! How many slides would you like?"
User: "Make it 8 slides"
Assistant: "Perfect! What style would you prefer? Professional, casual, or educational?"
User: "Professional"
Assistant: "🎉 Your presentation is ready! ..."
```

**Complex Request**:
```
User: "I need a professional presentation about AI with 15 slides, using the modern template and mint-blue theme. Make it text-heavy with stock images."
Assistant: "🎉 Your presentation is ready! ..."
```

**Status Check**:
```
User: "Check the status of task-9a827c13f4"
Assistant: "Task Status: completed. Your presentation is ready! ..."
```

**Response**:
```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "pres_1234567890_abc123",
    "success": true,
    "message": "🎉 Your presentation is ready!...",
    "presentationId": "d3000f96-096c-4768-b67b-e99aed029b57",
    "downloadUrl": "https://api.presenton.ai/static/...",
    "editUrl": "https://presenton.ai/presentation?id=...",
    "creditsConsumed": 8
  }
}
```

### 2. Direct Generation (Non-Conversational)
```
POST /api/presentation/generate
```

**Request Body**:
```json
{
  "content": "Introduction to Machine Learning",
  "n_slides": 10,
  "language": "English",
  "template": "modern",
  "theme": "professional-blue",
  "export_as": "pptx",
  "tone": "professional",
  "verbosity": "standard",
  "image_type": "stock",
  "web_search": false,
  "include_table_of_contents": false,
  "include_title_slide": true,
  "async": false
}
```

### 3. Check Task Status
```
GET /api/presentation/status/:taskId
```

### 4. Edit Presentation
```
POST /api/presentation/edit
```

**Request Body**:
```json
{
  "presentationId": "d3000f96-096c-4768-b67b-e99aed029b57",
  "slides": [
    {
      "index": 0,
      "content": {
        "title": "New Title"
      }
    },
    {
      "index": 5,
      "content": {
        "companyName": "ABC Company",
        "revenue": 2500000
      }
    }
  ],
  "export_as": "pptx"
}
```

### 5. Derive Presentation
```
POST /api/presentation/derive
```
Same request format as edit endpoint.

### 6. Get Presentation Details
```
GET /api/presentation/:presentationId
```

## Configuration

Add to your `.env` file:

```env
# Presenton API Configuration
PRESENTON_API_URL=http://localhost:5000
PRESENTON_API_KEY=sk-presenton-xxxxx

# Required for AI conversation analysis
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL_NAME=claude-sonnet-4-5-20250929
```

## How It Works

### Conversational Flow

1. **User sends message** → "Create a presentation about AI"

2. **AI analyzes intent** → Identifies: `generate` intent
   - Extracts parameters: `content: "AI"`
   - Identifies missing: `n_slides`, `tone`, etc.

3. **AI asks follow-up** → "How many slides would you like?"

4. **User responds** → "10 slides, professional tone"

5. **AI merges parameters** → Combines with previous parameters

6. **Check completeness** → All required params collected?
   - Yes → Generate presentation
   - No → Ask another follow-up question

7. **Call Presenton API** → Generate presentation

8. **Return result** → Presentation details with download/edit links

### Intent Detection

The AI can detect these intents:
- `generate`: Create new presentation
- `generate_async`: Create presentation asynchronously
- `check_status`: Check task status
- `edit`: Modify existing presentation
- `derive`: Create new from existing
- `get_info`: Get presentation details
- `general_question`: Answer questions about features

### Parameter Extraction

The AI intelligently extracts parameters from natural language:
- "professional presentation" → `tone: "professional"`, `template: "modern"`
- "10 slides" → `n_slides: 10`
- "detailed content" → `verbosity: "text-heavy"`
- "quick overview" → `n_slides: 5`, `verbosity: "concise"`

## Module Structure

```
presentation/
├── services/
│   ├── presentonAPIClient.js       # HTTP client for Presenton API
│   └── conversationAnalyzer.js     # AI-powered intent analyzer
├── utils/                           # Utility functions
├── presentation.constant.js         # Constants and configuration
├── presentation.validation.js       # Request validation schemas
├── presentation.service.js          # Business logic
├── presentation.controller.js       # Request handlers
├── presentation.route.js            # API routes
└── README.md                        # This file
```

## Authentication

- **Authenticated Users**: Regular authentication with subscription limits
- **Guest Users**: Supported with optional authentication
- **Rate Limiting**: Configurable rate limits per endpoint

## Error Handling

The module provides user-friendly error messages:
- Missing parameters → Follow-up questions
- API errors → Clear error messages
- Invalid requests → Validation errors

## Examples

### Example 1: Simple Presentation
```javascript
POST /api/presentation/assistant
{
  "message": "Create a presentation about Python programming"
}

// AI will ask follow-up questions and guide through the process
```

### Example 2: Complete Request
```javascript
POST /api/presentation/assistant
{
  "message": "Create a 15-slide professional presentation about blockchain technology using the modern template with stock images and a table of contents",
  "conversationId": "existing-conv-id"
}

// AI has all parameters and generates immediately
```

### Example 3: Edit Existing
```javascript
POST /api/presentation/assistant
{
  "message": "Update slide 3 of presentation d3000f96-096c-4768-b67b-e99aed029b57 to change the company name to XYZ Corp",
  "conversationId": "pres_123"
}

// AI extracts presentationId and slide edit instructions
```

## Integration with Existing Modules

- Uses `conversationService` for conversation management
- Integrates with `SubscriptionModel` for usage limits
- Follows the same patterns as `search` module
- Compatible with guest and authenticated users

## Future Enhancements

- [ ] Streaming support for real-time generation updates
- [ ] Batch generation for multiple presentations
- [ ] Template customization API
- [ ] Advanced slide manipulation (reordering, deletion)
- [ ] Presentation analytics and tracking
- [ ] Multi-language conversation support
