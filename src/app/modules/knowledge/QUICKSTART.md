# Unified Knowledge Module - Quick Start Guide

## 🚀 Quick Setup

### 1. Package Update

The module uses `rag-system-pgvector@2.4.9`. Already updated in package.json.

### 2. Environment Variables

Ensure these are set in your `.env`:

```env
# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Google Cloud Storage
GCP_PROJECT_ID=your_project_id
# Place alti_gcp.json in project root

# PostgreSQL RAG Database (already configured)
# Host: 34.135.175.69
# Port: 5432
# Database: rag_database
```

### 3. Module Structure

```
src/app/modules/knowledge/
├── knowledge.constant.js      # Configuration constants
├── knowledge.model.js         # File model with ownerType
├── knowledge_folder.model.js  # Folder model
├── knowledge.service.js       # Business logic
├── knowledge.controller.js    # API handlers
├── knowledge.route.js         # Route definitions
├── knowledge.validation.js    # Zod validation schemas
├── index.js                   # Module exports
├── README.md                  # Full documentation
├── middlewares/
│   └── uploadKnowledge.js    # Multer upload config
└── services/
    └── fileProcessor.js      # File processing utilities
```

---

## 💡 Key Concepts

### Owner Types

- **`user`** - Personal files (Knowledge Bank replacement)
- **`bot`** - Bot knowledge files (Knowledge Base replacement)

### Processing Flow

```
Upload → GCS Storage → Text Extraction → Chunking → Embedding → Vector DB → Ready
```

---

## 📋 Common Tasks

### Upload User File

```bash
curl -X POST http://localhost:5000/api/v1/knowledge/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@document.pdf" \
  -F "ownerType=user" \
  -F "processImmediately=true"
```

### Upload Bot Knowledge File

```bash
curl -X POST http://localhost:5000/api/v1/knowledge/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@knowledge.pdf" \
  -F "ownerType=bot" \
  -F "ownerId=bot_123"
```

### Get User's Files

```bash
curl -X GET "http://localhost:5000/api/v1/knowledge/files?ownerType=user" \
  -H "Authorization: Bearer TOKEN"
```

### Create Folder

```bash
curl -X POST http://localhost:5000/api/v1/knowledge/folders \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Work Files", "color": "#1890ff"}'
```

### Get Storage Stats

```bash
curl -X GET "http://localhost:5000/api/v1/knowledge/stats?ownerType=user" \
  -H "Authorization: Bearer TOKEN"
```

---

## 🎯 API Endpoints Summary

### Files

- `POST /api/v1/knowledge/upload` - Upload file
- `POST /api/v1/knowledge/process/:fileId` - Process with RAG
- `GET /api/v1/knowledge/files` - List files
- `GET /api/v1/knowledge/files/:fileId` - Get file details
- `DELETE /api/v1/knowledge/files/:fileId` - Delete file
- `GET /api/v1/knowledge/stats` - Storage statistics

### Folders (User files only)

- `POST /api/v1/knowledge/folders` - Create folder
- `GET /api/v1/knowledge/folders` - List folders
- `GET /api/v1/knowledge/folders/:folderId` - Get folder
- `PATCH /api/v1/knowledge/folders/:folderId` - Update folder
- `DELETE /api/v1/knowledge/folders/:folderId` - Delete folder
- `GET /api/v1/knowledge/folders/:folderId/contents` - Get contents

---

## 🔧 Configuration

Edit `knowledge.constant.js` to customize:

```javascript
export const KNOWLEDGE_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  EMBEDDING_MODEL: 'text-embedding-004',
  TEMPERATURE: 0.2,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200,
};
```

---

## 📊 Supported File Types

✅ PDF, DOCX, DOC, TXT, MD  
✅ CSV, JSON, XML, HTML  
✅ XLSX, XLS, PPTX, PPT

---

## 🐛 Troubleshooting

### File upload fails

- Check file size limit (50MB)
- Verify file type is supported
- Ensure GCS credentials are configured

### Processing stuck at "pending"

- Call `/process/:fileId` endpoint manually
- Check RAG database connectivity
- Verify Gemini API key is valid

### Folder operations not working

- Folders are only for `ownerType=user`
- Check folder exists before upload
- Verify parentFolderId is valid

---

## 🔄 Migration Guide

### From Knowledge Bank

```javascript
// OLD
POST / api / v1 / knowledge - bank / upload;

// NEW
POST / api / v1 / knowledge / upload;
{
  ownerType: 'user';
}
```

### From Knowledge Base

```javascript
// OLD
POST /api/v1/knowledge-base/upload

// NEW
POST /api/v1/knowledge/upload
{ ownerType: 'bot', ownerId: 'bot_id' }
```

---

## ✅ Testing Checklist

- [ ] Upload user file successfully
- [ ] Upload bot file successfully
- [ ] Create folder structure
- [ ] Upload file to folder
- [ ] Process file with RAG
- [ ] Retrieve file list
- [ ] Get storage statistics
- [ ] Delete file
- [ ] Delete folder (with/without recursive)

---

## 📚 Next Steps

1. Test upload functionality with Postman
2. Verify RAG processing works
3. Test folder operations
4. Import Postman collection (if available)
5. Read full [README.md](./README.md) for detailed docs

---

## 🎉 That's It!

You now have a unified knowledge system that handles both personal files and bot knowledge bases with:

- ✅ Smart RAG processing
- ✅ Folder organization
- ✅ Semantic search ready
- ✅ Cloud storage
- ✅ Gemini AI powered

Start uploading files and building your knowledge base! 🚀
