# Unified Knowledge Module

A comprehensive knowledge management system that unifies both **Knowledge Bank** (personal user files) and **Knowledge Base** (bot/AI assistant files) into a single, cohesive module.

## 🎯 Overview

This module provides a unified API for managing documents, processing them with RAG (Retrieval-Augmented Generation), and enabling semantic search capabilities using Google Gemini AI.

### Key Features

✅ **Unified Ownership Model** - Single system for both user files and bot knowledge bases  
✅ **Folder Organization** - Hierarchical folder structure for user files  
✅ **RAG Processing** - Automatic document chunking and embedding with Gemini  
✅ **Vector Search** - Semantic search using PostgreSQL pgvector  
✅ **Multiple File Types** - PDF, DOCX, TXT, CSV, JSON, XML, HTML, MD and more  
✅ **Cloud Storage** - Google Cloud Storage integration  
✅ **Processing Pipeline** - Async file processing with status tracking  
✅ **Statistics** - Storage and usage analytics  

---

## 🏗️ Architecture

### Owner Types

The system supports two owner types through the `ownerType` field:

1. **`user`** - Personal files (Knowledge Bank)
   - Files belong to individual users
   - Supports folder organization
   - Private by default with sharing options

2. **`bot`** - Bot knowledge files (Knowledge Base)
   - Files belong to AI assistants/bots
   - Accessible to all users of that bot
   - Used for conversational Q&A

### Data Models

#### KnowledgeFile Model
- `ownerType` - 'user' or 'bot'
- `ownerId` - userId or botId
- `folderId` - Optional folder reference (user files only)
- `documentId` - RAG system document ID
- `processingStatus` - pending, processing, completed, failed
- `gcsUrl` - Google Cloud Storage URL
- Plus metadata: tags, description, visibility, etc.

#### KnowledgeFolder Model (User files only)
- `userId` - Owner user ID
- `parentFolderId` - For nested folders
- `path` - Auto-generated path
- Statistics: fileCount, subfolderCount, totalSize

---

## 📡 API Endpoints

### Base URL
```
/api/v1/knowledge
```

### Authentication
All endpoints require authentication. Include JWT token in headers:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 File Operations

### 1. Upload File

**POST** `/upload`

Upload a file to the knowledge system.

**Request:**
- Content-Type: `multipart/form-data`
- Body Parameters:
  - `file` (file, required): The file to upload
  - `ownerType` (string, required): 'user' or 'bot'
  - `ownerId` (string, optional): Bot ID (required for bot files)
  - `folderId` (string, optional): Folder ID for user files
  - `description` (string, optional): File description
  - `tags` (JSON array string, optional): Tags, e.g., `["important", "work"]`
  - `processImmediately` (boolean string, optional): Set to `"true"` to process immediately

**Example (cURL):**
```bash
# Upload user file
curl -X POST http://localhost:5000/api/v1/knowledge/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "ownerType=user" \
  -F "description=Important document" \
  -F "tags=[\"work\", \"important\"]" \
  -F "processImmediately=true"

# Upload bot file
curl -X POST http://localhost:5000/api/v1/knowledge/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/knowledge.pdf" \
  -F "ownerType=bot" \
  -F "ownerId=bot_123456"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "success": true,
    "fileId": "674a1b2c3d4e5f6g7h8i9j0k",
    "fileName": "document.pdf",
    "fileType": "pdf",
    "fileSize": 1048576,
    "formattedFileSize": "1 MB",
    "gcsUrl": "https://storage.googleapis.com/...",
    "folderId": null,
    "ownerType": "user",
    "uploadedAt": "2024-11-05T10:30:00.000Z",
    "processingStatus": "pending"
  }
}
```

---

### 2. Process File

**POST** `/process/:fileId`

Manually trigger RAG processing for a file.

**Example:**
```bash
curl -X POST http://localhost:5000/api/v1/knowledge/process/674a1b2c3d4e5f6g7h8i9j0k \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File processed successfully",
  "data": {
    "success": true,
    "fileId": "674a1b2c3d4e5f6g7h8i9j0k",
    "documentId": "doc_abc123",
    "title": "Document Title",
    "chunkCount": 15,
    "processingStatus": "completed",
    "processedAt": "2024-11-05T10:35:00.000Z"
  }
}
```

---

### 3. Get Files

**GET** `/files`

Retrieve files by owner with optional filtering.

**Query Parameters:**
- `ownerType` (string, required): 'user' or 'bot'
- `ownerId` (string, optional): Bot ID (auto-filled for user files)
- `fileType` (string, optional): Filter by extension
- `processingStatus` (string, optional): pending, processing, completed, failed
- `isProcessed` (boolean, optional): true/false
- `folderId` (string, optional): Filter by folder (user files only)
- `limit` (number, optional): Results limit (default: 100)
- `skip` (number, optional): Pagination offset (default: 0)

**Example:**
```bash
# Get user's files
curl -X GET "http://localhost:5000/api/v1/knowledge/files?ownerType=user&fileType=pdf&isProcessed=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get bot's files
curl -X GET "http://localhost:5000/api/v1/knowledge/files?ownerType=bot&ownerId=bot_123456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Get File by ID

**GET** `/files/:fileId`

Get details of a specific file.

**Query Parameters:**
- `ownerType` (string, required): 'user' or 'bot'
- `ownerId` (string, optional): Bot ID if needed

**Example:**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge/files/674a1b2c3d4e5f6g7h8i9j0k?ownerType=user" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 5. Delete File

**DELETE** `/files/:fileId`

Soft delete a file.

**Body Parameters:**
- `ownerType` (string, required): 'user' or 'bot'
- `ownerId` (string, optional): Bot ID if needed

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/v1/knowledge/files/674a1b2c3d4e5f6g7h8i9j0k \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerType": "user"}'
```

---

### 6. Get Storage Statistics

**GET** `/stats`

Get storage usage statistics.

**Query Parameters:**
- `ownerType` (string, required): 'user' or 'bot'
- `ownerId` (string, optional): Bot ID if needed

**Example:**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge/stats?ownerType=user" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Storage statistics retrieved successfully",
  "data": {
    "totalFiles": 25,
    "processedFiles": 20,
    "pendingFiles": 5,
    "totalFolders": 8,
    "totalStorage": 52428800,
    "formattedStorage": "50 MB"
  }
}
```

---

## 📁 Folder Operations (User Files Only)

### 1. Create Folder

**POST** `/folders`

Create a new folder.

**Body Parameters:**
- `name` (string, required): Folder name
- `parentFolderId` (string, optional): Parent folder ID
- `description` (string, optional): Description
- `color` (string, optional): Hex color code
- `icon` (string, optional): Icon name
- `tags` (array, optional): Tags

**Example:**
```bash
curl -X POST http://localhost:5000/api/v1/knowledge/folders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Work Documents",
    "description": "Professional documents",
    "color": "#52c41a",
    "tags": ["work", "important"]
  }'
```

---

### 2. Get Folders

**GET** `/folders`

Get folders with optional parent filter.

**Query Parameters:**
- `parentFolderId` (string, optional): Parent folder ID or 'root'

**Example:**
```bash
# Get root folders
curl -X GET "http://localhost:5000/api/v1/knowledge/folders?parentFolderId=root" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get subfolders
curl -X GET "http://localhost:5000/api/v1/knowledge/folders?parentFolderId=674b1c2d3e4f5g6h7i8j9k0l" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. Get Folder by ID

**GET** `/folders/:folderId`

Get folder details with breadcrumb navigation.

**Example:**
```bash
curl -X GET http://localhost:5000/api/v1/knowledge/folders/674b1c2d3e4f5g6h7i8j9k0l \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Update Folder

**PATCH** `/folders/:folderId`

Update folder details.

**Body Parameters:**
- `name` (string, optional): New name
- `description` (string, optional): New description
- `color` (string, optional): New color
- `icon` (string, optional): New icon
- `tags` (array, optional): New tags

---

### 5. Delete Folder

**DELETE** `/folders/:folderId`

Delete a folder.

**Body Parameters:**
- `recursive` (boolean, optional): Delete contents (default: false)

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/v1/knowledge/folders/674b1c2d3e4f5g6h7i8j9k0l \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recursive": true}'
```

---

### 6. Get Folder Contents

**GET** `/folders/:folderId/contents`

Get subfolders and files in a folder.

**Example:**
```bash
# Get root contents
curl -X GET "http://localhost:5000/api/v1/knowledge/folders/root/contents" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get folder contents
curl -X GET "http://localhost:5000/api/v1/knowledge/folders/674b1c2d3e4f5g6h7i8j9k0l/contents" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚙️ Configuration

### Supported File Types
- PDF (`.pdf`)
- Word (`.doc`, `.docx`)
- Text (`.txt`, `.md`)
- Spreadsheets (`.xls`, `.xlsx`)
- Presentations (`.ppt`, `.pptx`)
- Data (`.csv`, `.json`, `.xml`)
- Web (`.html`)

### Limits
- Max file size: 50 MB
- Max files per request: 1

### AI Configuration
- Model: `gemini-2.5-flash`
- Embeddings: `text-embedding-004`
- Vector dimensions: 768
- Chunk size: 1000
- Chunk overlap: 200

---

## 🔧 Technical Details

### RAG System
- **Database**: PostgreSQL with pgvector extension
- **Package**: rag-system-pgvector v2.4.9
- **Host**: 34.135.175.69:5432
- **Embeddings**: Google Gemini text-embedding-004 (768 dimensions)
- **LLM**: Google Gemini 2.5 Flash

### Storage
- **Provider**: Google Cloud Storage
- **Bucket**: alti_assistant_knowledge_bot_files
- **Structure**:
  - User files: `users/{userId}[/folders/{folderId}]/{timestamp}_{filename}`
  - Bot files: `bots/{botId}/{timestamp}_{filename}`

### Processing Pipeline
1. File upload → GCS storage
2. Text extraction (PDF, DOCX, TXT, etc.)
3. Document chunking (1000 chars, 200 overlap)
4. Embedding generation (Gemini)
5. Vector storage (pgvector)
6. Metadata update (status, chunks, etc.)

---

## 🚀 Usage Examples

### Example 1: Upload User Document with Folder

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('ownerType', 'user');
formData.append('folderId', '674b1c2d3e4f5g6h7i8j9k0l');
formData.append('description', 'Q4 Report');
formData.append('tags', JSON.stringify(['report', 'q4', '2024']));
formData.append('processImmediately', 'true');

const response = await fetch('/api/v1/knowledge/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log('Uploaded:', result.data.fileId);
```

### Example 2: Upload Bot Knowledge File

```javascript
const formData = new FormData();
formData.append('file', knowledgeFile);
formData.append('ownerType', 'bot');
formData.append('ownerId', 'support_bot_001');
formData.append('description', 'FAQ Knowledge Base');
formData.append('processImmediately', 'true');

await fetch('/api/v1/knowledge/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

### Example 3: Create Folder Structure

```javascript
// Create parent folder
const parent = await fetch('/api/v1/knowledge/folders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Projects',
    color: '#1890ff'
  })
}).then(r => r.json());

// Create subfolder
const subfolder = await fetch('/api/v1/knowledge/folders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: '2024',
    parentFolderId: parent.data.id,
    color: '#52c41a'
  })
}).then(r => r.json());

console.log('Folder path:', subfolder.data.path); // "/Projects/2024"
```

---

## 🔄 Migration from Old Modules

### From Knowledge Bank
```javascript
// Old API
POST /api/v1/knowledge-bank/upload

// New API
POST /api/v1/knowledge/upload
Body: { ownerType: 'user', ... }
```

### From Knowledge Base
```javascript
// Old API
POST /api/v1/knowledge-base/upload

// New API
POST /api/v1/knowledge/upload
Body: { ownerType: 'bot', ownerId: 'bot_id', ... }
```

---

## 📊 Database Schema

### KnowledgeFile Collection
```javascript
{
  fileName: String,
  originalName: String,
  fileType: String,
  fileSize: Number,
  gcsUrl: String,
  gcsPath: String,
  ownerType: String, // 'user' or 'bot'
  ownerId: String,   // userId or botId
  folderId: ObjectId, // Optional
  documentId: String, // RAG document ID
  title: String,
  chunkCount: Number,
  isProcessed: Boolean,
  processingStatus: String,
  description: String,
  tags: [String],
  visibility: String,
  // ... metadata, timestamps
}
```

### KnowledgeFolder Collection
```javascript
{
  name: String,
  userId: String,
  parentFolderId: ObjectId,
  path: String,
  description: String,
  color: String,
  icon: String,
  tags: [String],
  fileCount: Number,
  subfolderCount: Number,
  totalSize: Number,
  // ... metadata, timestamps
}
```

---

## 🐛 Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid ownerType` | Missing or incorrect ownerType | Use 'user' or 'bot' |
| `Owner ID is required` | Missing ownerId for bot files | Provide botId |
| `File type not supported` | Unsupported file extension | Check supported types list |
| `File not found` | Invalid fileId or wrong owner | Verify fileId and ownership |
| `Folder not found` | Invalid folderId | Check folder exists |

---

## 📝 Notes

- **User files** can be organized in folders; bot files cannot
- **Processing** is async; use `processImmediately=true` to trigger immediately
- **Soft delete** is used; files remain in storage but marked inactive
- **RAG processing** may take time depending on file size
- **Embeddings** are generated using Google Gemini AI

---

## 🔐 Security

- JWT authentication required for all endpoints
- Files are scoped to owners (users can only access their own files)
- Bot files require explicit botId authorization
- GCS files are private by default

---

## 📞 Support

For issues or questions, contact the development team or create an issue in the repository.
