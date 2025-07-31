# Intelligent Conversational Search Agent

## Overview
The search module provides an intelligent, conversational search agent built on LangGraph that understands context and only searches when necessary.

## Features

### 🤖 Intelligent Search Classification
- Uses AI to determine if a query needs external search or can be answered directly
- Considers conversation context when making decisions
- Avoids unnecessary searches for general knowledge questions

### 💬 Conversational Awareness
- Maintains conversation context across multiple exchanges
- References previous topics naturally
- Builds upon earlier responses for coherent conversations

### 👤 Guest User Support
- Supports both authenticated and guest users
- Guest users get proper MongoDB ObjectIds for session tracking
- Guest conversations persist for continuation via conversation ID

### 🔍 Smart Search Routing
- **Context Analysis**: Analyzes query intent and conversation history
- **Intelligent Search**: Performs targeted searches with query optimization
- **Direct Answers**: Provides immediate responses for general knowledge
- **Conversational Synthesis**: Combines search results with conversational context

## Architecture

### Workflow Nodes
1. **analyzeContextNode**: Determines if search is needed based on query and context
2. **intelligentSearchNode**: Performs optimized searches when needed
3. **directAnswerNode**: Provides direct answers without search
4. **conversationalSynthesisNode**: Synthesizes search results conversationally

### Key Components
- **State Management**: Enhanced state with conversation context handling
- **LLM Functions**: Context-aware classification and response generation
- **Search Tools**: Tavily integration with smart query optimization
- **Workflow**: LangGraph orchestration with conditional routing

## Usage

### Basic Search
```javascript
POST /api/v1/search
{
  "message": "What is quantum computing?",
  "conversationId": "optional"
}
```

### Conversational Search
```javascript
POST /api/v1/search
{
  "message": "Tell me more about quantum entanglement",
  "conversationId": "existing-conversation-id"
}
```

### Guest User Search
```javascript
POST /api/v1/search
{
  "message": "Latest AI developments",
  "userId": "generated-guest-id" // Auto-generated if not provided
}
```

## Response Format

```javascript
{
  "success": true,
  "data": {
    "responseMessage": {
      "answer": "Conversational response with citations [1][2]",
      "reference": [
        {
          "title": "Source Title",
          "url": "https://source.com",
          "content": "Relevant excerpt"
        }
      ]
    },
    "conversationId": "conversation-id",
    "messageCount": 4,
    "userType": "authenticated|guest",
    "userId": "user-or-guest-id"
  }
}
```

## Intelligence Features

### Context-Aware Classification
- Analyzes conversation history to understand follow-up questions
- Distinguishes between time-sensitive and general knowledge queries
- Considers user intent beyond literal query text

### Search Optimization
- Refines search queries based on conversation context
- Avoids redundant searches for previously covered topics
- Optimizes for relevance using conversation awareness

### Conversational Responses
- Natural, engaging response style
- References previous conversation appropriately
- Maintains topic continuity across messages

## Technical Details

### Models Used
- **LLM**: Groq with qwen/qwen3-32b model
- **Search**: Tavily Search API
- **Storage**: MongoDB with conversation persistence

### Performance Features
- Intelligent caching through conversation state
- Reduced API calls through smart classification
- Optimized search queries for better results

## Configuration

Required environment variables:
- `GROQ_API_KEY`: Groq API key for LLM processing
- `TAVILY_API_KEY`: Tavily API key for search functionality
- `DATABASE_LOCAL`: MongoDB connection string

## Error Handling
- Graceful degradation when external services fail
- Conversation state preservation during errors
- User-friendly error messages with retry suggestions

## Recent Updates

### v2.0 - Conversational Intelligence
- Complete rewrite of search agent for conversational awareness
- Added intelligent search classification to avoid unnecessary searches
- Enhanced conversation context handling
- Improved guest user support with proper MongoDB ObjectIds
- Added reference metadata to search responses
- Optimized workflow for better performance and user experience
