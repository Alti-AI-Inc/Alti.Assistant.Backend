# Unified Knowledge Module - Architecture Diagram

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                            │
│                    (Web / Mobile / API Client)                       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ JWT Token
                                │
                    ┌───────────▼──────────┐
                    │   API Gateway        │
                    │  /api/v1/knowledge   │
                    └───────────┬──────────┘
                                │
                ┌───────────────┴────────────────┐
                │                                 │
         ┌──────▼───────┐              ┌────────▼────────┐
         │  Auth Layer   │              │   Validation    │
         │  (JWT Check)  │              │   (Zod Schema)  │
         └──────┬────────┘              └────────┬────────┘
                │                                 │
                └────────────┬────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Controllers   │
                    │ knowledge.controller.js │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Services     │
                    │ knowledge.service.js │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                   │
   ┌──────▼───────┐  ┌──────▼──────┐   ┌───────▼────────┐
   │ File Processor│  │  RAG System  │   │  GCS Storage   │
   │ (Extract Text)│  │  (Gemini AI) │   │  (Cloud Files) │
   └──────┬────────┘  └──────┬──────┘   └───────┬────────┘
          │                  │                   │
          └──────────────────┼───────────────────┘
                             │
          ┌──────────────────┴───────────────────┐
          │                                      │
   ┌──────▼────────┐                   ┌────────▼────────┐
   │   MongoDB      │                   │   PostgreSQL    │
   │  (Metadata)    │                   │   (Vectors)     │
   │                │                   │   + pgvector    │
   │ - KnowledgeFile│                   │                 │
   │ - KnowledgeFolder                  │ - Document Chunks│
   └────────────────┘                   │ - Embeddings    │
                                        └─────────────────┘
```

## 🔄 Data Flow Diagrams

### Upload & Process Flow

```
User Upload Request
       │
       ▼
┌─────────────────────┐
│  1. Upload File     │
│  - Validate         │
│  - Check Auth       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  2. Store in GCS    │
│  - Generate path    │
│  - Upload buffer    │
│  - Get public URL   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  3. Save Metadata   │
│  - MongoDB insert   │
│  - Status: pending  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  4. Extract Text    │
│  - PDF → text       │
│  - DOCX → text      │
│  - TXT → text       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  5. RAG Processing  │
│  - Chunk text       │
│  - Generate embeddings│
│  - Store vectors    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  6. Update Status   │
│  - Status: completed│
│  - Save documentId  │
│  - Save chunkCount  │
└─────────────────────┘
```

### Query Flow

```
User Query Request
       │
       ▼
┌─────────────────────┐
│  1. Validate Query  │
│  - Check ownerType  │
│  - Verify ownership │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  2. Search Vectors  │
│  - Generate query   │
│    embedding        │
│  - Similarity search│
│  - Get top chunks   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  3. Generate Answer │
│  - Context from RAG │
│  - Gemini LLM       │
│  - Structured output│
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  4. Return Response │
│  - JSON format      │
│  - Source citations │
└─────────────────────┘
```

## 📊 Database Schema

### MongoDB Collections

```
┌─────────────────────────────────────────────────────────┐
│  KnowledgeFile Collection                               │
├─────────────────────────────────────────────────────────┤
│  _id:           ObjectId                                │
│  fileName:      String                                  │
│  originalName:  String                                  │
│  fileType:      String                                  │
│  fileSize:      Number                                  │
│  gcsUrl:        String                                  │
│  gcsPath:       String                                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ ownerType:   String  ('user' | 'bot')          │    │
│  │ ownerId:     String  (userId or botId)         │    │
│  └────────────────────────────────────────────────┘    │
│  folderId:      ObjectId (optional)                     │
│  documentId:    String (RAG document ID)                │
│  title:         String                                  │
│  chunkCount:    Number                                  │
│  isProcessed:   Boolean                                 │
│  processingStatus: String                               │
│  description:   String                                  │
│  tags:          Array<String>                           │
│  visibility:    String                                  │
│  metadata:      Object                                  │
│  createdAt:     Date                                    │
│  updatedAt:     Date                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  KnowledgeFolder Collection                             │
├─────────────────────────────────────────────────────────┤
│  _id:           ObjectId                                │
│  name:          String                                  │
│  userId:        String                                  │
│  parentFolderId: ObjectId (optional)                    │
│  path:          String (auto-generated)                 │
│  description:   String                                  │
│  color:         String                                  │
│  icon:          String                                  │
│  tags:          Array<String>                           │
│  fileCount:     Number                                  │
│  subfolderCount: Number                                 │
│  totalSize:     Number                                  │
│  isActive:      Boolean                                 │
│  createdAt:     Date                                    │
│  updatedAt:     Date                                    │
└─────────────────────────────────────────────────────────┘
```

### PostgreSQL Tables (pgvector)

```
┌─────────────────────────────────────────────────────────┐
│  rag_documents Table                                    │
├─────────────────────────────────────────────────────────┤
│  id:            UUID (Primary Key)                      │
│  document_id:   String                                  │
│  content:       Text                                    │
│  embedding:     VECTOR(768)  ← Gemini embeddings       │
│  metadata:      JSONB                                   │
│    ├─ ownerType: String                                │
│    ├─ ownerId:   String                                │
│    ├─ fileId:    String                                │
│    └─ gcsUrl:    String                                │
│  created_at:    Timestamp                               │
└─────────────────────────────────────────────────────────┘

Index: ON embedding USING ivfflat (vector_cosine_ops)
```

## 🔐 Authentication Flow

```
┌──────────────┐
│   Client     │
│  (Browser)   │
└──────┬───────┘
       │ 1. Login with credentials
       │
       ▼
┌──────────────┐
│  Auth API    │
│  /api/v1/auth│
└──────┬───────┘
       │ 2. Generate JWT
       │
       ▼
┌──────────────┐
│   Client     │
│  stores JWT  │
└──────┬───────┘
       │ 3. Request with JWT header
       │    Authorization: Bearer <token>
       │
       ▼
┌──────────────┐
│ Auth Middle- │
│    ware      │
│  (Verify JWT)│
└──────┬───────┘
       │ 4. Extract userId
       │
       ▼
┌──────────────┐
│  Controller  │
│  (Access     │
│   userId)    │
└──────────────┘
```

## 📦 Module Dependencies

```
knowledge/
│
├─ External Dependencies
│  ├─ @langchain/google-genai  (Gemini AI)
│  ├─ @google-cloud/storage    (GCS)
│  ├─ rag-system-pgvector      (RAG)
│  ├─ mongoose                 (MongoDB)
│  ├─ multer                   (File upload)
│  ├─ pdf-parse                (PDF extraction)
│  ├─ mammoth                  (DOCX extraction)
│  └─ zod                      (Validation)
│
├─ Internal Dependencies
│  ├─ shared/logger.js
│  ├─ shared/catchAsync.js
│  ├─ shared/sendResponse.js
│  ├─ errors/ApiError.js
│  ├─ middlewares/auth.js
│  └─ config/index.js
│
└─ Module Exports
   ├─ knowledgeRoutes
   ├─ knowledgeController
   ├─ knowledgeService
   ├─ KnowledgeFile (model)
   └─ KnowledgeFolder (model)
```

## 🎯 Ownership Model

```
┌─────────────────────────────────────────────┐
│          Knowledge System                   │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐  ┌──────────────────┐│
│  │   ownerType:     │  │   ownerType:     ││
│  │     'user'       │  │     'bot'        ││
│  ├──────────────────┤  ├──────────────────┤│
│  │ Personal Files   │  │ Bot Knowledge    ││
│  │ ✓ Folders        │  │ ✗ No folders     ││
│  │ ✓ Private        │  │ ✓ Shared         ││
│  │ ✓ User-owned     │  │ ✓ Bot-owned      ││
│  │                  │  │                  ││
│  │ ownerId:         │  │ ownerId:         ││
│  │ = userId         │  │ = botId          ││
│  └──────────────────┘  └──────────────────┘│
│                                             │
│        Same Storage (GCS Bucket)            │
│        Same RAG System (pgvector)           │
│        Same API Endpoints                   │
└─────────────────────────────────────────────┘
```

## 🚀 Processing Pipeline

```
┌─────────────┐
│   Upload    │
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Validation │────→│  File Check  │
└──────┬──────┘     │  - Type      │
       │            │  - Size      │
       │            └──────────────┘
       ▼
┌─────────────┐     ┌──────────────┐
│ GCS Upload  │────→│  Public URL  │
└──────┬──────┘     │  Generated   │
       │            └──────────────┘
       ▼
┌─────────────┐     ┌──────────────┐
│   Mongo     │────→│  File Record │
│   Insert    │     │  Created     │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│    Text     │────→│  Extracted   │
│ Extraction  │     │  Content     │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Document   │────→│   Chunks     │
│  Chunking   │     │  (1000 char) │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Embedding  │────→│ 768-dim      │
│ Generation  │     │ Vectors      │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  pgvector   │────→│ Vector Index │
│   Insert    │     │   Created    │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Update    │────→│  Status:     │
│   Status    │     │  'completed' │
└─────────────┘     └──────────────┘
```

## 🌐 API Route Structure

```
/api/v1/knowledge
│
├─ /upload                          [POST]
│  └─ Body: file, ownerType, ownerId, folderId
│
├─ /process/:fileId                 [POST]
│  └─ Trigger RAG processing
│
├─ /files                           [GET]
│  └─ Query: ownerType, ownerId, filters
│
├─ /files/:fileId                   [GET, DELETE]
│  ├─ GET: Query: ownerType, ownerId
│  └─ DELETE: Body: ownerType, ownerId
│
├─ /stats                           [GET]
│  └─ Query: ownerType, ownerId
│
└─ /folders                         [POST, GET]
   │
   ├─ /:folderId                    [GET, PATCH, DELETE]
   │  └─ User folder operations
   │
   └─ /:folderId/contents           [GET]
      └─ Get folder contents
```

---

This architecture provides:

- ✅ **Scalability** - Cloud storage + vector DB
- ✅ **Performance** - Efficient embeddings + indexes
- ✅ **Flexibility** - Unified ownership model
- ✅ **Maintainability** - Clean separation of concerns
- ✅ **Security** - JWT auth + owner verification
