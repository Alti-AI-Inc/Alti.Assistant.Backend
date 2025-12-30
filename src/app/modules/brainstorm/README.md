# Brainstorm Module

An AI-powered brainstorming assistant that helps users explore, develop, and refine ideas through structured creative thinking and multiple brainstorming techniques.

## Features

- **Conversational Interface**: Natural language interaction for brainstorming
- **Multiple Techniques**: SCAMPER, Mind Mapping, SWOT, Six Thinking Hats, and more
- **Multi-Perspective Analysis**: Business, technical, creative, user-centric, strategic views
- **Flexible Depth Levels**: Quick, standard, deep, and comprehensive brainstorming
- **Idea Refinement**: Iterative improvement of ideas
- **Export Capabilities**: Export sessions in Markdown or JSON format
- **Guest & Authenticated Users**: Works for both logged-in users and guests
- **Subscription-Aware**: Respects user usage limits and subscriptions

## API Endpoints

### 1. Conversational Assistant (Recommended)

**POST** `/api/v1/brainstorm/assistant`

Natural language interface for brainstorming.

**Request:**
```json
{
  "message": "Help me brainstorm ideas for a fitness app",
  "conversationId": "brainstorm_123456_abc" // optional, for continuing conversation
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I want to create a mobile app for yoga practitioners"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "success": true,
    "conversationId": "brainstorm_1234567890_abc123",
    "response": "## 💡 Main Ideas (20)\n\n### 1. Personalized Yoga Journey Tracker...",
    "brainstormData": {
      "mainIdeas": [...],
      "subIdeas": [...],
      "opportunities": [...],
      "risks": [...],
      "nextSteps": [...]
    },
    "metadata": {
      "totalIdeasGenerated": 25,
      "mainIdeas": 20,
      "subIdeas": 5,
      "techniqueUsed": "free_association",
      "perspectivesAnalyzed": ["business", "user_centric"]
    },
    "needsMoreInfo": false
  }
}
```

### 2. Structured Brainstorm Generation

**POST** `/api/v1/brainstorm/generate`

Generate brainstorm with explicit parameters for programmatic access.

**Request:**
```json
{
  "idea": "A platform connecting freelance designers with startups",
  "brainstormType": "business_strategy",
  "technique": "swot",
  "perspective": ["business", "technical", "competitive"],
  "depth": "deep",
  "focusAreas": ["innovation", "profitability"],
  "constraints": {
    "budget": "low budget startup",
    "timeline": "6 months to MVP",
    "targetAudience": "tech startups"
  },
  "additionalInstructions": "Focus on unique value propositions"
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `idea` | string | Yes | The seed idea to brainstorm (10-2000 chars) |
| `brainstormType` | enum | No | Type of brainstorming (see types below) |
| `technique` | enum | No | Brainstorming technique to apply |
| `perspective` | array | No | Perspectives to analyze from |
| `depth` | enum | No | Brainstorming depth level |
| `focusAreas` | array | No | Specific areas to focus on |
| `constraints` | object | No | Budget, timeline, technology constraints |
| `additionalInstructions` | string | No | Any specific instructions |

**Brainstorm Types:**
- `product_idea` - New product or service ideas
- `business_strategy` - Business planning and strategy
- `marketing_campaign` - Marketing and promotional ideas
- `technical_solution` - Technical problem solving
- `creative_content` - Creative writing and content
- `problem_solving` - General problem solving
- `process_improvement` - Process optimization
- `general` - General brainstorming

**Techniques:**
- `scamper` - Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse
- `mind_map` - Hierarchical idea exploration
- `six_thinking_hats` - Six different thinking modes
- `swot` - Strengths, Weaknesses, Opportunities, Threats
- `five_whys` - Root cause analysis
- `reverse_brainstorm` - Reverse problem solving
- `brainwriting` - Written idea building
- `free_association` - Unconstrained idea generation
- `starbursting` - Who, What, Where, When, Why, How questions
- `role_storming` - Different personas' perspectives

**Perspectives:**
- `business` - ROI, market fit, revenue
- `technical` - Feasibility, architecture
- `creative` - Innovation, uniqueness
- `user_centric` - User needs, UX
- `strategic` - Long-term vision
- `operational` - Implementation, logistics
- `financial` - Costs, profitability
- `competitive` - Market positioning

**Depth Levels:**
- `quick` - Fast overview (~10 ideas)
- `standard` - Normal brainstorm (~20 ideas)
- `deep` - In-depth analysis (~35 ideas)
- `comprehensive` - Most thorough (~50+ ideas)

### 3. Get Conversation History

**GET** `/api/v1/brainstorm/conversation/:conversationId`

Retrieve previous brainstorming session.

**Example:**
```bash
curl -X GET http://localhost:5000/api/v1/brainstorm/conversation/brainstorm_123456_abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "success": true,
    "conversation": {
      "conversationId": "brainstorm_123456_abc",
      "title": "Brainstorm: fitness app",
      "messages": [...],
      "metadata": {...},
      "createdAt": "2025-12-17T10:00:00.000Z",
      "updatedAt": "2025-12-17T10:15:00.000Z"
    }
  }
}
```

### 4. Export Brainstorm Session

**POST** `/api/v1/brainstorm/export`

Export brainstorm session in various formats.

**Request:**
```json
{
  "conversationId": "brainstorm_123456_abc",
  "format": "markdown",
  "includeHistory": true
}
```

**Formats:**
- `markdown` - Formatted Markdown file
- `json` - Structured JSON data
- `pdf` - PDF document (coming soon)
- `html` - HTML document (coming soon)

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Brainstorm session exported successfully",
  "data": {
    "success": true,
    "format": "markdown",
    "content": "# Brainstorm Session Export\n\n...",
    "filename": "brainstorm_123456_abc_1702812345.md"
  }
}
```

### 5. Refine Existing Brainstorm

**POST** `/api/v1/brainstorm/refine`

Refine and improve ideas from existing brainstorm session.

**Request:**
```json
{
  "conversationId": "brainstorm_123456_abc",
  "message": "Can you refine the top 3 ideas and make them more feasible?",
  "focusOn": ["Personalized Yoga Journey Tracker", "AI Pose Correction"]
}
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Brainstorm refined successfully",
  "data": {
    "success": true,
    "conversationId": "brainstorm_123456_abc",
    "response": "## Refinement Suggestions\n\n...",
    "refinementData": {
      "refinedIdeas": [...],
      "enhancements": [...],
      "alternativeApproaches": [...]
    }
  }
}
```

## Usage Examples

### Example 1: Simple Brainstorm

```bash
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Help me brainstorm marketing ideas for a new eco-friendly water bottle"
  }'
```

### Example 2: Multi-Turn Conversation

**First Request:**
```json
{
  "message": "I want to create a SaaS product for small businesses"
}
```

**Response includes:** `conversationId: "brainstorm_123456_abc"`

**Second Request (continuing):**
```json
{
  "conversationId": "brainstorm_123456_abc",
  "message": "Can you focus on the technical aspects?"
}
```

### Example 3: Structured Brainstorm with SCAMPER

```json
{
  "idea": "Online grocery delivery service",
  "technique": "scamper",
  "depth": "deep",
  "perspective": ["business", "user_centric", "competitive"]
}
```

### Example 4: SWOT Analysis

```json
{
  "idea": "AI-powered resume builder",
  "technique": "swot",
  "brainstormType": "product_idea",
  "focusAreas": ["marketability", "profitability"]
}
```

## Response Structure

### Main Brainstorm Response

The formatted response includes:

```markdown
## 💡 Main Ideas (20)

### 1. Idea Title
Description of the idea...

**Why this works:** Reasoning
**Category:** Category name
**Perspective:** business
**Priority:** high

## 🔸 Supporting Ideas (5)

1. **Sub-idea title**: Description

## 🚀 Opportunities

1. **Opportunity title** (Impact: high)
   Description...

## ⚠️ Potential Challenges

1. **Challenge title** (Severity: medium)
   Description...
   *Mitigation:* How to address

## 📋 Next Steps

1. Actionable step 1
2. Actionable step 2
```

### Metadata Structure

```json
{
  "totalIdeasGenerated": 25,
  "mainIdeas": 20,
  "subIdeas": 5,
  "opportunities": 3,
  "risks": 2,
  "nextSteps": 5,
  "techniqueUsed": "free_association",
  "perspectivesAnalyzed": ["business", "user_centric"],
  "depthLevel": "standard",
  "brainstormType": "product_idea"
}
```

## Authentication

### Authenticated Users
Include JWT token in Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Guest Users
No authentication required, but:
- Limited features
- No conversation history persistence beyond session
- Rate limits apply

## Rate Limits

- **Conversational Assistant**: 30 requests per 15 minutes
- **Structured Generation**: 20 requests per 15 minutes
- **Export**: 10 requests per 15 minutes
- **Refinement**: 20 requests per 15 minutes

## Subscription Tiers

- **Free**: 5 brainstorm sessions per month
- **Pro**: 50 sessions per month
- **Enterprise**: Unlimited sessions

## Error Responses

```json
{
  "statusCode": 400,
  "success": false,
  "message": "Message must be at least 10 characters"
}
```

Common error codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (usage limit exceeded)
- `404` - Not Found (conversation not found)
- `500` - Internal Server Error

## Best Practices

1. **Start with conversational assistant** for natural exploration
2. **Use structured endpoint** when you know exactly what you want
3. **Iterate on ideas** using the refine endpoint
4. **Export valuable sessions** for future reference
5. **Provide context** in your messages for better results
6. **Specify constraints** to get more relevant ideas
7. **Use appropriate depth** - quick for fast ideas, deep for thorough analysis

## Tips for Better Results

1. **Be specific** - "fitness app for yoga" vs "fitness app"
2. **Provide context** - mention target audience, constraints, goals
3. **Use multiple perspectives** - get well-rounded analysis
4. **Try different techniques** - different techniques yield different insights
5. **Refine iteratively** - start broad, then narrow down
6. **Combine approaches** - use SWOT after free_association

## Technical Details

- **AI Model**: Gemini 2.0 Flash Exp
- **Max Message Length**: 5000 characters
- **Max Idea Length**: 2000 characters
- **Temperature**: 0.8 (creative)
- **Max Output Tokens**: 8192

## Support

For issues or questions:
- Check conversation history for context
- Provide conversationId when reporting issues
- Include error messages in bug reports

---

**Next:** See [QUICKSTART.md](./QUICKSTART.md) for a quick setup guide.
