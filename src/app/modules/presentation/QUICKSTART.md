# Presentation Module - Quick Start Guide

## Setup (5 minutes)

### 1. Install Dependencies

All dependencies are already installed (Anthropic, Axios, etc.)

### 2. Configure Environment Variables

Add to your `.env` file:

```env
PRESENTON_API_URL=http://localhost:5000
PRESENTON_API_KEY=sk-presenton-xxxxx
```

Get your API key from: https://presenton.ai/account

### 3. Start the Server

```bash
npm start
# or
node server.js
```

The module is automatically registered at `/api/presentation`

## Quick Test

### Test 1: Simple Conversational Request

```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a presentation about AI"
  }'
```

Expected Response:

```json
{
  "success": true,
  "data": {
    "conversationId": "pres_xxx",
    "needsMoreInfo": true,
    "message": "Great! How many slides would you like?",
    "collectedParameters": {
      "content": "AI"
    }
  }
}
```

### Test 2: Complete Request in One Message

```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a professional presentation about Machine Learning with 10 slides using the modern template"
  }'
```

Expected Response:

```json
{
  "success": true,
  "data": {
    "conversationId": "pres_xxx",
    "success": true,
    "message": "🎉 Your presentation is ready!...",
    "presentationId": "xxx-xxx-xxx",
    "downloadUrl": "https://...",
    "editUrl": "https://...",
    "creditsConsumed": 10
  }
}
```

### Test 3: Direct Generation (Non-Conversational)

```bash
curl -X POST http://localhost:3000/api/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Python Programming",
    "n_slides": 8,
    "template": "modern",
    "tone": "educational"
  }'
```

## Common Use Cases

### Use Case 1: User Wants a Quick Presentation

**User**: "Make a presentation about climate change"

**Flow**:

1. AI asks: "How many slides?"
2. User: "5 slides"
3. AI generates presentation

### Use Case 2: User Provides All Details

**User**: "Create a professional 15-slide presentation about AI with the modern template"

**Flow**:

1. AI has all info, generates immediately

### Use Case 3: User Wants to Edit

**User**: "Update slide 3 of presentation abc-123 to change the title"

**Flow**:

1. AI extracts presentation ID and edit request
2. May ask: "What should the new title be?"
3. User provides title
4. AI edits presentation

## API Endpoints Summary

| Endpoint                           | Method | Purpose                         |
| ---------------------------------- | ------ | ------------------------------- |
| `/api/presentation/assistant`      | POST   | Conversational interface (MAIN) |
| `/api/presentation/generate`       | POST   | Direct generation               |
| `/api/presentation/status/:taskId` | GET    | Check async status              |
| `/api/presentation/edit`           | POST   | Edit presentation               |
| `/api/presentation/derive`         | POST   | Derive new from existing        |
| `/api/presentation/:id`            | GET    | Get presentation details        |

## Features at a Glance

✅ **Conversational AI** - Natural language understanding
✅ **Smart Parameter Extraction** - AI extracts info from messages
✅ **Follow-up Questions** - Asks when info is missing
✅ **Context Awareness** - Remembers conversation history
✅ **Multiple Generation Modes** - Sync and async
✅ **Template & Theme Support** - 4 templates, 5 themes
✅ **Customization** - Tone, verbosity, image types
✅ **Edit & Derive** - Modify existing presentations
✅ **Guest Support** - Works without authentication
✅ **Error Handling** - User-friendly error messages

## Supported Templates

- `general` - Versatile for most use cases
- `modern` - Contemporary design
- `standard` - Classic professional
- `swift` - Minimalist

## Supported Themes

- `edge-yellow`
- `mint-blue`
- `light-rose`
- `professional-blue`
- `professional-dark`

## Supported Tones

- `default` - Neutral
- `casual` - Relaxed
- `professional` - Formal
- `funny` - Humorous
- `educational` - Clear and explanatory
- `sales_pitch` - Persuasive

## Troubleshooting

### Issue: "Failed to generate presentation"

**Solution**: Check that `PRESENTON_API_KEY` is set correctly in `.env`

### Issue: "Unauthorized" error

**Solution**: Verify your API key is valid at https://presenton.ai/account

### Issue: AI not understanding intent

**Solution**: Be more specific in your request, e.g., "Create a new presentation" instead of "I need help"

### Issue: Missing parameters

**Solution**: The AI will ask follow-up questions. Answer them to proceed.

## Advanced Usage

### Custom Themes

Create custom themes at: https://presenton.ai/account?tab=themes
Use theme name in your request

### Async Generation (for large presentations)

```json
{
  "message": "Create a 50-slide detailed presentation about Quantum Physics. Generate it asynchronously."
}
```

### Edit Multiple Slides

```json
{
  "message": "Edit presentation xxx, update slide 1 title to 'New Title', slide 3 company to 'TechCorp', and slide 5 bullets to include three new points"
}
```

## Integration Tips

1. **With Frontend**:

   - Store `conversationId` in state
   - Send with each subsequent message
   - Display AI responses in chat interface

2. **With Existing Systems**:

   - Use `/generate` endpoint for programmatic access
   - Parse `presentationId` for tracking
   - Store `downloadUrl` and `editUrl` in your database

3. **Error Handling**:
   - Always check `success` field
   - Display `message` to user
   - Log errors for debugging

## Next Steps

1. ✅ Test basic conversation flow
2. ✅ Try different templates and themes
3. ✅ Test async generation
4. ✅ Try editing existing presentations
5. ✅ Integrate with your frontend

## Support

For issues or questions:

1. Check the main README.md
2. Review examples.js for usage patterns
3. Check Presenton API docs: https://docs.presenton.ai

## Module Structure

```
presentation/
├── services/                    # API clients and AI analyzers
├── utils/                       # Helper functions
├── presentation.constant.js     # Configuration
├── presentation.validation.js   # Request validation
├── presentation.service.js      # Business logic
├── presentation.controller.js   # Request handlers
├── presentation.route.js        # API routes
├── README.md                    # Full documentation
├── QUICKSTART.md               # This file
└── examples.js                  # Usage examples
```

## Performance Tips

- Use async generation for 20+ slides
- Cache conversation context
- Implement rate limiting for production
- Monitor API usage and costs

---

**That's it! You're ready to create presentations conversationally! 🎉**
