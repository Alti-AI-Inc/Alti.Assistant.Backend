# Knowledge Module - Conversational API Guide

## Overview

The Knowledge Module provides a unified system for managing and querying documents with AI-powered conversational capabilities. It supports both **user files** (Knowledge Bank) and **bot files** (Knowledge Base).

---

## Conversational Features

### 1. Chat with Your Knowledge Base
**POST** `/api/v1/knowledge/chat`

Have a natural conversation with your uploaded documents. Maintains conversation history and context.

#### Request Body
```json
{
  "message": "What are the key findings in my research papers?",
  "ownerType": "user",
  "ownerId": "optional-user-id",
  "conversationId": "optional-existing-conversation-id",
  "topK": 5
}
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Query processed successfully",
  "data": {
    "success": true,
    "conversationId": "knowledge_1735740000000_abc123",
    "answer": "Based on your research papers, the key findings are...",
    "sources": [
      {
        "documentId": "doc_xyz789",
        "content": "Relevant excerpt from document...",
        "score": 0.95,
        "fileName": "research_paper.pdf",
        "fileType": "pdf"
      }
    ],
    "relevantFiles": 5,
    "hasProcessedFiles": true
  }
}
```

#### Example Usage
```javascript
// Start a new conversation
const response = await fetch('/api/v1/knowledge/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Summarize the main points from my project documents",
    ownerType: "user"
  })
});

const { data } = await response.json();
const conversationId = data.conversationId;

// Continue the conversation
const followUp = await fetch('/api/v1/knowledge/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Can you elaborate on the first point?",
    ownerType: "user",
    conversationId: conversationId
  })
});
```

---

### 2. Direct Query (One-off Questions)
**POST** `/api/v1/knowledge/query`

Ask a single question without maintaining conversation history.

#### Request Body
```json
{
  "query": "What is the definition of machine learning in my notes?",
  "ownerType": "user",
  "ownerId": "optional-user-id",
  "topK": 5
}
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Query processed successfully",
  "data": {
    "success": true,
    "answer": "According to your notes, machine learning is...",
    "sources": [...],
    "relevantFiles": 10,
    "query": "What is the definition of machine learning in my notes?"
  }
}
```

---

### 3. Semantic Search
**POST** `/api/v1/knowledge/search`

Find relevant document chunks based on semantic similarity.

#### Request Body
```json
{
  "query": "budget planning strategies",
  "ownerType": "user",
  "limit": 10
}
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Search completed successfully",
  "data": {
    "success": true,
    "results": [
      {
        "documentId": "doc_abc123",
        "content": "Effective budget planning strategies include...",
        "score": 0.92,
        "fileName": "financial_guide.pdf",
        "fileType": "pdf",
        "fileId": "674a1b2c3d4e5f6g7h8i9j0k"
      }
    ],
    "totalResults": 10,
    "query": "budget planning strategies"
  }
}
```

---

### 4. Get Conversation History
**GET** `/api/v1/knowledge/conversations/:conversationId`

Retrieve the full history of a conversation.

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversation": {
      "conversationId": "knowledge_1735740000000_abc123",
      "userId": "user_id",
      "title": "Knowledge Query: What are the key findings...",
      "metadata": {
        "category": "knowledge",
        "model": "gemini-2.5-flash",
        "ownerType": "user",
        "ownerId": "user_id"
      },
      "createdAt": "2026-01-01T10:00:00.000Z"
    },
    "messages": [
      {
        "role": "user",
        "content": "What are the key findings in my research?",
        "timestamp": "2026-01-01T10:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "The key findings are...",
        "timestamp": "2026-01-01T10:00:05.000Z",
        "metadata": {
          "sources": [...]
        }
      }
    ]
  }
}
```

---

## Owner Types

### User Files (Knowledge Bank)
```json
{
  "ownerType": "user",
  "ownerId": "optional-defaults-to-current-user"
}
```
- Personal document library
- Supports folders and organization
- Private by default

### Bot Files (Knowledge Base)
```json
{
  "ownerType": "bot",
  "ownerId": "bot_id_12345"
}
```
- Shared knowledge for AI bots
- Multiple users can query the same bot's knowledge
- Used for building custom AI assistants

---

## Complete Workflow Example

```javascript
// 1. Upload documents
const formData = new FormData();
formData.append('file', document.getElementById('fileInput').files[0]);
formData.append('ownerType', 'user');
formData.append('processImmediately', 'true');

const uploadRes = await fetch('/api/v1/knowledge/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// 2. Wait for processing (or check status)
const { data: fileData } = await uploadRes.json();
console.log('File uploaded:', fileData.fileId);

// 3. Start conversational query
const chatRes = await fetch('/api/v1/knowledge/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "What is this document about?",
    ownerType: "user"
  })
});

const { data: chatData } = await chatRes.json();
console.log('AI Response:', chatData.answer);
console.log('Conversation ID:', chatData.conversationId);

// 4. Continue conversation
const followUpRes = await fetch('/api/v1/knowledge/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Can you provide more details about section 2?",
    ownerType: "user",
    conversationId: chatData.conversationId
  })
});

// 5. Get conversation history
const historyRes = await fetch(
  `/api/v1/knowledge/conversations/${chatData.conversationId}`,
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
);
```

---

## Features

✅ **Conversational AI**: Natural language Q&A with context awareness  
✅ **RAG System**: Retrieval-Augmented Generation for accurate answers  
✅ **Source Citations**: Every answer includes relevant document sources  
✅ **Conversation History**: Track and retrieve past conversations  
✅ **Semantic Search**: Find relevant content across all documents  
✅ **Multi-format Support**: PDF, DOCX, TXT, CSV, JSON, MD, and more  
✅ **Unified System**: Works for both personal files and bot knowledge  

---

## Error Handling

### No Processed Files
```json
{
  "data": {
    "success": false,
    "message": "No processed files found. Please upload and process files first.",
    "answer": "I don't have any documents to search through yet.",
    "sources": []
  }
}
```

### Processing in Progress
Upload files with `processImmediately: true` or manually trigger processing:
```bash
POST /api/v1/knowledge/process/:fileId
```

---

## Best Practices

1. **Upload and Process**: Always process files before querying
2. **Use Conversations**: For related questions, maintain conversationId
3. **Specify Owner**: Be explicit about ownerType and ownerId
4. **Limit Results**: Use topK (default: 5) to control response sources
5. **Check Sources**: Review source citations for accuracy

---

## Related Endpoints

- **Upload File**: `POST /api/v1/knowledge/upload`
- **Process File**: `POST /api/v1/knowledge/process/:fileId`
- **Get Files**: `GET /api/v1/knowledge/files`
- **Get Stats**: `GET /api/v1/knowledge/stats`
- **Manage Folders**: `/api/v1/knowledge/folders/*`

See [KNOWLEDGE_MODULE_API.md](./KNOWLEDGE_MODULE_API.md) for complete API documentation.
