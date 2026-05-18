# Enhanced Image Module - Migration to Standard Architecture

## Overview

The enhanced_image module has been refactored to match the standard module architecture used across the application (similar to the search module). This ensures consistency, maintainability, and proper integration with the conversation system.

## Key Changes

### 1. **Removed Buffer Memory / Session Manager**

- **Before**: Used in-memory SessionManager for storing conversation history
- **After**: Uses the Conversation schema (MongoDB) for persistent storage
- **Benefits**:
  - Data persists across server restarts
  - Consistent with other modules
  - Better scalability
  - Supports conversation history and analytics

### 2. **Standardized Response Structure**

- **Before**: Custom response format `{ success, image, prompt, error }`
- **After**: Standard `sendResponse()` format with:
  ```javascript
  {
    statusCode: 200,
    success: true,
    message: 'Image generated successfully',
    data: {
      responseMessage: {
        answer: '...',
        image: {...},
        metadata: {...}
      },
      conversationId: '...',
      messageCount: 2,
      userType: 'guest' | 'authenticated'
    }
  }
  ```

### 3. **Guest User Support**

- Supports both authenticated and guest users
- Uses `optionalAuth()` middleware
- Guest users get temporary MongoDB ObjectId for tracking
- Conversations marked with `isGuest` flag

### 4. **Subscription Limits Integration**

- Checks user subscription limits before processing
- Integrates with payment/subscription module
- Returns appropriate error messages when limits exceeded

### 5. **Conversation Integration**

- All image generation/editing creates or continues conversations
- Messages stored with proper metadata
- Supports conversation history for context-aware operations
- Each conversation has unique ID following pattern: `image-{timestamp}-{random}`

### 6. **File Structure Cleanup**

```
enhanced_image/
├── enhanced_image.controller.js    # Main controller (NEW)
├── enhanced_image.service.js       # Main service (NEW)
├── enhanced_image.route.js         # Main routes (NEW)
├── enhanced_image.validation.js    # Zod validation schemas (NEW)
├── utils/                          # Image processing utilities (KEPT)
│   ├── imagegen2.5.service.js
│   ├── imagegen4.service.js
│   ├── imagen3.service.js
│   ├── imageIntentAnalyzer.js
│   ├── intentClassifier.js
│   └── promptEvaluator.js
└── [OLD STRUCTURE - TO BE REMOVED]
    ├── controllers/
    ├── routes/
    └── services/
```

## API Endpoints

### Base Path: `/enhanced-image`

#### 1. Generate Image (POST `/generate`)

Generate an image from a text prompt.

**Request Body:**

```json
{
  "prompt": "A beautiful sunset over mountains",
  "conversationId": "optional-conversation-id",
  "aspectRatio": "16:9", // optional
  "negativePrompt": "blurry, low quality", // optional
  "userId": "optional-for-guest-tracking" // optional
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Image generated successfully",
  "data": {
    "responseMessage": {
      "answer": "Image generated successfully using imagen4",
      "image": {
        "filename": "image-direct-1234567890.png",
        "url": "https://...",
        "service": "imagen4",
        "reasoning": "High quality realistic image",
        "confidence": 0.95
      },
      "prompt": "A beautiful sunset over mountains",
      "metadata": {
        "imageUrl": "https://...",
        "filename": "...",
        "service": "imagen4",
        "aspectRatio": "16:9",
        "timestamp": "2025-11-26T..."
      }
    },
    "conversationId": "image-1732632000-abc123xyz",
    "messageCount": 2,
    "userType": "guest",
    "userId": "507f1f77bcf86cd799439011"
  }
}
```

#### 2. Edit Image (POST `/edit`)

Edit an existing image with a text prompt.

**Request Body:**

```json
{
  "prompt": "Add a rainbow to the sky",
  "imageBase64": "data:image/png;base64,...",
  "conversationId": "optional-conversation-id",
  "aspectRatio": "16:9", // optional
  "userId": "optional-for-guest-tracking" // optional
}
```

**Response:** Similar to generate endpoint

#### 3. Analyze Intent (POST `/analyze-intent`)

Analyze the intent of an image generation prompt.

**Request Body:**

```json
{
  "prompt": "Create a professional logo for a tech company"
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Intent analyzed successfully",
  "data": {
    "intent": "logo_design",
    "confidence": 0.92,
    "suggestedService": "imagen4",
    "reasoning": "Logo design requires high precision..."
  }
}
```

#### 4. Get Statistics (GET `/stats`)

Get image generation statistics (authenticated users only).

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Image statistics retrieved successfully",
  "data": {
    "totalImageConversations": 45,
    "totalGenerations": 30,
    "totalEdits": 15,
    "totalMessages": 90
  }
}
```

## Migration Guide

### For Frontend Developers

1. **Update API Base Path**

   - Old: Various paths (`/image/...`)
   - New: `/enhanced-image/...`

2. **Update Request Format**

   - Add `conversationId` to continue existing conversations
   - Include `userId` for guest user tracking (optional)

3. **Update Response Handling**

   - Response now nested under `data.responseMessage`
   - Access image via `data.responseMessage.image`
   - Get conversation info from `data.conversationId` and `data.messageCount`

4. **Handle Conversation History**
   - Store `conversationId` from response
   - Send it in subsequent requests to maintain context

### For Backend Developers

1. **Controller Changes**

   - All controllers use `catchAsync()` wrapper
   - All responses use `sendResponse()` helper
   - Subscription checks integrated
   - Guest user support enabled

2. **Service Changes**

   - All services interact with conversation schema
   - OpenMemory integration for memory persistence
   - Error handling improved with proper ApiError throwing

3. **Validation**
   - All routes use Zod validation schemas
   - Validation errors automatically handled

## Environment Variables

Required environment variables:

```env
GOOGLE_API_KEY=your-google-api-key-here
```

## Dependencies

- `mongoose`: Conversation schema and database operations
- `@google/generative-ai`: Image generation services
- `zod`: Request validation
- Existing conversation module
- Existing payment/subscription module

## Testing

### Test Image Generation

```bash
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful landscape with mountains and lakes"
  }'
```

### Test Image Editing

```bash
curl -X POST http://localhost:3000/enhanced-image/edit \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add more clouds to the sky",
    "imageBase64": "data:image/png;base64,..."
  }'
```

### Test with Authentication

```bash
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "A beautiful landscape",
    "conversationId": "image-1732632000-abc123"
  }'
```

## Next Steps

1. **Remove Old Structure**: Delete `controllers/`, `routes/`, `services/` subdirectories after verifying new implementation
2. **Update Frontend**: Migrate frontend code to use new API structure
3. **Test Thoroughly**: Test all endpoints with both guest and authenticated users
4. **Monitor**: Watch for any issues in production

## Support

For questions or issues, contact the development team or create an issue in the repository.
