# Knowledge Bank - Quick Reference

## 🚀 Quick Start

### Upload a File
```bash
POST /api/v1/knowledge-bank/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

files: <file>
description: "My document"
tags: ["work", "project"]
processImmediately: "true"
```

### Get Your Files
```bash
GET /api/v1/knowledge-bank/files?limit=20&fileType=pdf
Authorization: Bearer <token>
```

### Process a File
```bash
POST /api/v1/knowledge-bank/files/:fileId/process
Authorization: Bearer <token>
```

### Delete a File
```bash
DELETE /api/v1/knowledge-bank/files/:fileId
Authorization: Bearer <token>
```

### Get Storage Stats
```bash
GET /api/v1/knowledge-bank/stats
Authorization: Bearer <token>
```

---

## 📦 Module Structure

```
knowledge_bank/
├── knowledge_bank.model.js       # MongoDB schema
├── knowledge_bank.service.js     # Business logic + GCS
├── knowledge_bank.controller.js  # Request handlers
├── knowledge_bank.routes.js      # API routes
├── index.js                      # Exports
└── README.md                     # Documentation
```

---

## 🔑 Key Concepts

### Knowledge Bank vs Knowledgebot
- **Knowledge Bank**: User's personal file storage (this module)
- **Knowledgebot**: Bot-specific knowledge base (separate module)

### GCS Buckets
- Knowledge Bank: `alti_knowledge_bank_files`
- Knowledgebot: `alti_knowledge_bot_files`

### Processing Status
- `pending`: Uploaded, not processed
- `processing`: Currently processing
- `completed`: Ready to use
- `failed`: Processing error

---

## 💡 Common Use Cases

### 1. Upload and Process Immediately
```javascript
const formData = new FormData();
formData.append('files', file);
formData.append('processImmediately', 'true');

await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

### 2. Upload and Process Later
```javascript
// Upload
const uploadRes = await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { data } = await uploadRes.json();
const fileId = data.fileId;

// Process later
await fetch(`/api/v1/knowledge-bank/files/${fileId}/process`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 3. Filter Files
```javascript
// Get only PDF files that are processed
const response = await fetch(
  '/api/v1/knowledge-bank/files?fileType=pdf&isProcessed=true',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

---

## 🛠️ Service Methods

```javascript
import { knowledgeBankService } from './knowledge_bank/knowledge_bank.service.js';

// Upload file
await knowledgeBankService.uploadFile(file, userId, options);

// Get user files
await knowledgeBankService.getUserFiles(userId, filters);

// Process file
await knowledgeBankService.processUploadedFile(fileId);

// Delete file
await knowledgeBankService.deleteFile(fileId, userId);

// Get stats
await knowledgeBankService.getUserStorageStats(userId);
```

---

## 📊 Response Format

### Success
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Operation successful",
  "data": { /* result data */ }
}
```

### Error
```json
{
  "statusCode": 400,
  "success": false,
  "message": "Error description"
}
```

---

## 🔧 Configuration

### Required Environment Variables
```env
GCS_KNOWLEDGE_BANK_BUCKET=alti_knowledge_bank_files
OPENAI_API_KEY=your_key
GCP_PROJECT_ID=your_project
```

### Service Account
Place `alti_gcp.json` in project root with GCS permissions.

---

## 📝 File Metadata

```javascript
{
  id: "674a1b2c...",
  fileName: "1699876543210_document.pdf",
  originalName: "document.pdf",
  fileType: "pdf",
  fileSize: 1048576,
  formattedFileSize: "1 MB",
  gcsUrl: "https://storage.googleapis.com/...",
  documentId: "doc_abc123",  // After processing
  title: "Document Title",
  description: "User description",
  tags: ["work", "project"],
  chunkCount: 15,
  isProcessed: true,
  processingStatus: "completed",
  createdAt: "2024-11-05T10:30:00.000Z",
  updatedAt: "2024-11-05T10:35:00.000Z"
}
```

---

## ✅ Checklist for Usage

- [ ] GCS bucket created (`alti_knowledge_bank_files`)
- [ ] Service account configured (`alti_gcp.json`)
- [ ] Environment variables set
- [ ] RAG database configured
- [ ] OpenAI API key set
- [ ] Routes registered in main router
- [ ] Authentication middleware working

---

## 🐛 Troubleshooting

### Upload Fails
✓ Check file size (< 50MB)  
✓ Verify GCS bucket permissions  
✓ Check service account JSON key  

### Processing Fails
✓ Verify RAG database connection  
✓ Check OpenAI API key  
✓ Review `processingError` field  

### File Not Found
✓ Ensure file belongs to user  
✓ Check if file is active  
✓ Verify fileId is correct  

---

## 📚 Full Documentation

- **API Docs**: `docs/KNOWLEDGE_BANK_API.md`
- **Module README**: `src/app/modules/knowledge_bank/README.md`
- **Implementation Summary**: `KNOWLEDGE_BANK_IMPLEMENTATION.md`

---

## 🎯 Key Features

✅ Upload to GCS  
✅ Store metadata in DB  
✅ Process with RAG  
✅ Filter & retrieve  
✅ Soft delete  
✅ Storage stats  
✅ Full authentication  

---

**Status**: ✅ Ready to Use  
**Version**: 1.0.0  
**Base URL**: `/api/v1/knowledge-bank`
