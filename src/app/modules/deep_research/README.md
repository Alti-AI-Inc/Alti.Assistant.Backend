# Deep Research Assistant API - Guest User Support

## Overview
The Deep Research Assistant API provides comprehensive, recursive deep research capabilities for both authenticated and guest users. It follows the same patterns as the search module for consistency and enhanced user experience.

## Features

### 🔬 Recursive Deep Research
- Multi-stage research process with breadth-first exploration
- Intelligent lead identification and deep-dive analysis
- Knowledge graph construction and quality metrics
- PDF report generation capabilities

### 👤 Guest User Support
- Supports both authenticated and guest users
- Guest users get proper MongoDB ObjectIds for session tracking
- Guest conversations persist for continuation via conversation ID
- No authentication required for guest access

### 💬 Conversation Integration
- Full conversation history management
- Context-aware processing for follow-up questions
- Proper message threading and metadata storage
- Deep search conversation categorization

## API Endpoints

### POST `/deep-research/assistant`

Performs comprehensive deep research on a given query.

#### For Authenticated Users:
- Include `Authorization: Bearer <token>` header
- Full conversation history is saved
- Usage counts against subscription limits
- Rate limiting: 10 requests per 15 minutes (heavy computational cost)

#### For Guest Users:
- No authorization header required
- Conversation history is still persisted for session continuity
- No subscription limits
- Same rate limiting applies (10 requests per 15 minutes)
- Guest ID is auto-generated for session tracking

#### Request Body:
```json
{
  "query": "string (required, max 1000 chars)",
  "conversationId": "string (optional)",
  "generatePdf": "boolean (optional, default: false)",
  "maxDepth": "number (optional, 1-5, default: 3)",
  "userId": "string (optional, for guest users)"
}
```

#### Response Format:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Deep research completed successfully",
  "data": {
    "query": "original research query",
    "answer": "comprehensive research report",
    "classification": "deep_research",
    "sources": [
      {
        "title": "Source Title",
        "url": "https://source.com",
        "content": "Relevant content excerpt"
      }
    ],
    "promisingLeads": [
      {
        "title": "Research Lead",
        "whyPromising": "Explanation of why this lead is valuable",
        "researchQuestions": ["Question 1", "Question 2"]
      }
    ],
    "deepDiveResults": [
      {
        "leadTitle": "Lead Title",
        "searchCount": 5,
        "sourceCount": 15,
        "analysis": "Detailed analysis of the lead"
      }
    ],
    "qualityMetrics": {
      "totalSources": 50,
      "sourceQuality": 8.5,
      "coverageDepth": 9.2,
      "factualAccuracy": 9.0
    },
    "knowledgeGraph": {
      "nodes": [],
      "relationships": []
    },
    "metadata": {
      "processingTime": 45000,
      "totalSteps": 6,
      "savedId": "research-id-for-pdf"
    },
    "conversationId": "conversation-id",
    "researchProgress": {
      "phase": "completed",
      "completedSteps": 6,
      "totalSteps": 6
    },
    "messageCount": 4,
    "userType": "guest|authenticated",
    "userId": "guest-user-id (only for guests)",
    "pdf": {
      "filename": "research-report.pdf",
      "size": 1024000,
      "downloadUrl": "/api/deep-research/download-pdf/research-id"
    }
  }
}
```

### GET `/deep-research/stats`

Get deep research statistics for authenticated users only.

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Deep research statistics retrieved successfully",
  "data": {
    "totalDeepResearchConversations": 15,
    "totalDeepResearchMessages": 60,
    "averageMessagesPerConversation": 4
  }
}
```

### GET `/deep-research/download-pdf/:savedId`

Download generated PDF reports (supports both authenticated and guest users).

## Research Process

### Stage 1: Initialization
- Research plan generation
- Complexity assessment
- Resource allocation

### Stage 2: Breadth-First Search
- Multiple diverse search queries
- Broad topic coverage
- Source collection and scoring

### Stage 3: Lead Analysis
- Promising direction identification
- Research question formulation
- Priority ranking

### Stage 4: Deep Dive
- Targeted searches for each lead
- Detailed investigation
- Evidence collection

### Stage 5: Synthesis
- Comprehensive report generation
- Knowledge graph construction
- Quality metrics calculation

### Stage 6: Finalization
- PDF generation (if requested)
- Result storage
- Conversation update

## Technical Features

### Models Used
- **LLM**: Groq with multiple models for different stages
- **Search**: Tavily Search API with advanced queries
- **Storage**: MongoDB with conversation persistence
- **PDF Generation**: Custom report generation system

### Performance Features
- Intelligent caching through conversation state
- Progressive result delivery
- Resource optimization
- Error recovery mechanisms

## Rate Limiting

- **Authenticated Users**: 10 requests per 15 minutes
- **Guest Users**: 10 requests per 15 minutes
- **Reason**: Deep research is computationally intensive

## Error Handling

- Graceful degradation when external services fail
- Conversation state preservation during errors
- User-friendly error messages with context
- Automatic error logging to conversations

## Guest User Flow

1. User makes request without authentication
2. System generates unique guest user ID (MongoDB ObjectId)
3. Conversation is created in database with guest metadata
4. Research proceeds normally with full feature access
5. Results and conversation history are preserved
6. Guest can continue conversation using conversation ID

## Integration Notes

- Follows same patterns as search module for consistency
- Uses shared conversation service for message management
- Integrates with subscription system for authenticated users
- Supports both JSON responses (no streaming due to complexity)
- Full middleware stack integration (auth, validation, rate limiting)

## Configuration

Required environment variables:
- `GROQ_API_KEY`: Groq API key for LLM processing
- `TAVILY_API_KEY`: Tavily API key for search functionality
- `DATABASE_LOCAL`: MongoDB connection string

## Recent Updates

### v1.0 - Initial Implementation
- Complete deep research workflow implementation
- Guest user support with full conversation persistence
- PDF generation capabilities
- Quality metrics and knowledge graph construction
- Integration with existing conversation system
- Consistent API patterns with search module
