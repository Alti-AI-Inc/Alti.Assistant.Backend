# Enhanced Image Module - Quick Start Guide

## 🚀 Testing the New Module

### Prerequisites

- Server running on http://localhost:3000 (or your configured port)
- Valid `GOOGLE_API_KEY` in environment variables

### 1. Test Image Generation (Guest User)

**Without Conversation:**

```bash
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunset with a lake reflection"
  }'
```

**With Conversation (Context-Aware):**

```bash
# First request
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape"
  }'

# Note the conversationId from the response, then:
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add a sunset",
    "conversationId": "image-1732632000-abc123xyz"
  }'
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Image generated successfully",
  "data": {
    "responseMessage": {
      "answer": "Image generated successfully using imagen4",
      "image": {
        "filename": "image-direct-1732632000123.png",
        "url": "https://storage.googleapis.com/...",
        "service": "imagen4",
        "reasoning": "High quality realistic landscape image",
        "confidence": 0.95
      },
      "prompt": "A serene mountain landscape at sunset with a lake reflection",
      "metadata": {
        "imageUrl": "https://...",
        "filename": "image-direct-1732632000123.png",
        "service": "imagen4",
        "timestamp": "2025-11-26T10:30:00.123Z"
      }
    },
    "conversationId": "image-1732632000-abc123xyz",
    "messageCount": 2,
    "userType": "guest",
    "userId": "507f1f77bcf86cd799439011"
  }
}
```

### 2. Test Image Editing (Guest User)

```bash
curl -X POST http://localhost:3000/enhanced-image/edit \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add more clouds to the sky",
    "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }'
```

### 3. Test with Authentication

**First, get your auth token:**

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'
```

**Then use the token:**

```bash
curl -X POST http://localhost:3000/enhanced-image/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "prompt": "A futuristic city skyline at night",
    "aspectRatio": "16:9"
  }'
```

### 4. Test Intent Analysis

```bash
curl -X POST http://localhost:3000/enhanced-image/analyze-intent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a minimalist logo for a tech startup"
  }'
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Intent analyzed successfully",
  "data": {
    "intent": "logo_design",
    "confidence": 0.92,
    "suggestedService": "imagen4",
    "reasoning": "Logo design requires high precision and professional quality"
  }
}
```

### 5. Test Statistics (Authenticated Only)

```bash
curl -X GET http://localhost:3000/enhanced-image/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

**Expected Response:**

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

## 🧪 Testing Scenarios

### Scenario 1: Guest User Journey

1. Generate an image without auth
2. Save the `conversationId` from response
3. Generate another image with same `conversationId`
4. Verify conversation continuity

### Scenario 2: Authenticated User Journey

1. Login and get JWT token
2. Generate multiple images
3. Check stats endpoint
4. Verify subscription limits

### Scenario 3: Subscription Limits

1. Use authenticated account near limit
2. Attempt image generation
3. Should receive limit warning/error

### Scenario 4: Error Handling

1. Send request with empty prompt
2. Send edit request without imageBase64
3. Verify proper error responses

## 🔍 Verifying Database Changes

### Check MongoDB Conversations

```javascript
// In MongoDB shell or Compass
db.conversations
  .find({
    'metadata.category': { $in: ['image_generation', 'image_editing'] },
  })
  .sort({ createdAt: -1 })
  .limit(10);
```

### Verify Conversation Messages

```javascript
db.conversations.findOne({
  conversationId: 'image-1732632000-abc123xyz',
});
```

## 📊 Expected Database Structure

```javascript
{
  "_id": ObjectId("..."),
  "conversationId": "image-1732632000-abc123xyz",
  "userId": ObjectId("..."),
  "title": "Image: A serene mountain landscape...",
  "messages": [
    {
      "role": "user",
      "content": "A serene mountain landscape",
      "timestamp": ISODate("2025-11-26T10:30:00.000Z"),
      "metadata": {
        "type": "image_request",
        "timestamp": "2025-11-26T10:30:00.000Z"
      }
    },
    {
      "role": "assistant",
      "content": "Image generated successfully using imagen4",
      "timestamp": ISODate("2025-11-26T10:30:05.000Z"),
      "metadata": {
        "type": "image_result",
        "imageUrl": "https://...",
        "filename": "image-direct-1732632000123.png",
        "service": "imagen4",
        "reasoning": "...",
        "confidence": 0.95,
        "timestamp": "2025-11-26T10:30:05.000Z"
      }
    }
  ],
  "status": "active",
  "metadata": {
    "category": "image_generation",
    "model": "imagen",
    "userType": "guest",
    "isGuest": true
  },
  "messageCount": 2,
  "createdAt": ISODate("2025-11-26T10:30:00.000Z"),
  "updatedAt": ISODate("2025-11-26T10:30:05.000Z")
}
```

## ⚠️ Common Issues & Solutions

### Issue 1: "Conversation not found"

**Solution:** Make sure to use the exact `conversationId` from the previous response.

### Issue 2: "Failed to generate image"

**Solution:** Verify `GOOGLE_API_KEY` is set in environment variables.

### Issue 3: "Subscription limit reached"

**Solution:** This is expected behavior for users who exceeded their limits. Upgrade subscription or test with different user.

### Issue 4: 401 Unauthorized on stats endpoint

**Solution:** Stats endpoint requires authentication. Include valid JWT token in Authorization header.

## 🎯 Success Criteria

✅ Image generates successfully for guest users  
✅ Image generates successfully for authenticated users  
✅ Conversation history is maintained across requests  
✅ Subscription limits are enforced for authenticated users  
✅ Stats endpoint returns correct data  
✅ Error messages are clear and helpful  
✅ Database stores all conversations correctly  
✅ Response format matches documentation

## 📝 Notes

- Guest users don't have subscription limits
- All image URLs are temporary and may expire based on GCP storage settings
- Conversation IDs are unique and cannot be reused after deletion
- Stats endpoint only available for authenticated users
- Intent analysis doesn't require authentication

## 🔗 Related Documentation

- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Complete migration documentation
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Technical summary of changes
- Search module - Reference implementation pattern

## 💡 Tips for Frontend Developers

1. **Always store conversationId**: Enables conversation continuity
2. **Handle guest users**: Store userId temporarily in localStorage for tracking
3. **Show loading states**: Image generation can take 5-10 seconds
4. **Display metadata**: Show service used, confidence scores, etc.
5. **Error handling**: Display user-friendly messages from response.message
6. **Retry logic**: Implement retry for failed generations
7. **Image caching**: Cache generated images to reduce repeated generations

## 🚦 Ready for Production?

Before deploying to production:

- [ ] All tests passing
- [ ] Frontend integration complete
- [ ] Error handling verified
- [ ] Rate limiting configured
- [ ] Monitoring set up
- [ ] Old structure removed (optional)
- [ ] Documentation updated
- [ ] Team trained on new structure
