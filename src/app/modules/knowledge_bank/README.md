# Knowledge Bank Module

## Overview

The Knowledge Bank is a file management system that allows users to upload, store, retrieve, and process their personal files. This is **separate from the knowledgebot** functionality.

### Key Differences

| Feature | Knowledge Bank | Knowledgebot |
|---------|---------------|--------------|
| **Purpose** | Personal file storage for users | Bot-specific knowledge base |
| **Ownership** | Files belong to user | Files belong to specific bot/knowledge base |
| **GCS Bucket** | `alti_knowledge_bank_files` | `alti_assistant_knowledge_bot_files` |
| **Use Case** | General document management | AI chatbot training data |
| **API Endpoint** | `/api/v1/knowledge-bank` | `/api/v1/knowledgebase` |

## Architecture

```
knowledge_bank/
├── knowledge_bank.model.js       # MongoDB schema for file metadata
├── knowledge_bank.service.js     # Business logic (GCS upload, RAG processing)
├── knowledge_bank.controller.js  # HTTP request handlers
├── knowledge_bank.routes.js      # Route definitions
└── index.js                      # Module exports
```

## Features

✅ **File Upload to GCS**: Upload files to Google Cloud Storage bucket  
✅ **Database Storage**: Store file metadata in MongoDB  
✅ **File Retrieval**: Get user's files with filtering options  
✅ **File Deletion**: Soft delete files (mark as inactive)  
✅ **RAG Processing**: Process files with RAG system for AI interactions  
✅ **Storage Statistics**: Track user's storage usage  
✅ **Authentication**: All endpoints require user authentication  

## API Endpoints

### Base URL: `/api/v1/knowledge-bank`

1. **POST** `/upload` - Upload file to knowledge bank
2. **GET** `/files` - Get user's files (with optional filters)
3. **GET** `/files/:fileId` - Get specific file details
4. **DELETE** `/files/:fileId` - Delete file
5. **POST** `/files/:fileId/process` - Process file with RAG system
6. **GET** `/stats` - Get user's storage statistics

## Usage Example

### 1. Upload a File

```javascript
const formData = new FormData();
formData.append('files', fileInput.files[0]);
formData.append('description', 'My document');
formData.append('tags', JSON.stringify(['work', 'important']));
formData.append('processImmediately', 'true');

const response = await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
// result.data.fileId - use this to reference the file
```

### 2. Get User's Files

```javascript
const response = await fetch('/api/v1/knowledge-bank/files?fileType=pdf&limit=20', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const result = await response.json();
// result.data.files - array of file objects
```

### 3. Process a File

```javascript
const response = await fetch(`/api/v1/knowledge-bank/files/${fileId}/process`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const result = await response.json();
// result.data.documentId - RAG system document ID
```

### 4. Delete a File

```javascript
const response = await fetch(`/api/v1/knowledge-bank/files/${fileId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const result = await response.json();
// result.success - true if deleted
```

## Database Schema

### KnowledgeBankFile

```javascript
{
  fileName: String,           // Stored filename (timestamped)
  originalName: String,       // Original filename
  fileType: String,          // File extension
  fileSize: Number,          // Size in bytes
  gcsUrl: String,            // Google Cloud Storage URL
  gcsPath: String,           // Path in GCS bucket
  gcsBucket: String,         // Bucket name
  userId: ObjectId,          // User reference
  documentId: String,        // RAG document ID (after processing)
  title: String,             // Document title
  description: String,       // User description
  tags: [String],            // Tags for organization
  chunkCount: Number,        // Number of RAG chunks
  isProcessed: Boolean,      // Processing status
  processingStatus: String,  // 'pending', 'processing', 'completed', 'failed'
  processingError: String,   // Error message if failed
  processedAt: Date,         // Processing timestamp
  isActive: Boolean,         // Soft delete flag
  metadata: Mixed,           // Additional metadata
  uploadSource: String,      // Upload source
  ipAddress: String,         // Uploader IP
  createdAt: Date,          // Creation timestamp
  updatedAt: Date           // Update timestamp
}
```

## Configuration

### Environment Variables

```env
# Google Cloud Storage
GCS_KNOWLEDGE_BANK_BUCKET=alti_knowledge_bank_files

# RAG System (PostgreSQL)
RAG_DB_HOST=34.135.175.69
RAG_DB_PORT=5432
RAG_DB_NAME=rag_database
RAG_DB_USER=postgres
RAG_DB_PASSWORD=Em0nd4r0ck@2

# OpenAI (for embeddings and RAG)
OPENAI_API_KEY=your_openai_key
```

### GCS Bucket Setup

1. Create a GCS bucket named `alti_knowledge_bank_files`
2. Configure IAM permissions for the service account
3. Ensure the service account JSON key file (`alti_gcp.json`) is in the project root

## Processing Flow

```
1. User uploads file
   ↓
2. File uploaded to GCS bucket
   ↓
3. Metadata saved to MongoDB (status: 'pending')
   ↓
4. [Optional] File processing triggered
   ↓
5. RAG system processes file
   - Downloads from GCS
   - Extracts text
   - Creates embeddings
   - Stores in vector database
   ↓
6. Metadata updated (status: 'completed', documentId saved)
   ↓
7. File ready for AI-powered queries
```

## Supported File Types

- **Documents**: PDF, DOC, DOCX, TXT, MD
- **Data**: CSV, JSON, XML
- **Web**: HTML
- **Spreadsheets**: XLS, XLSX
- **Presentations**: PPT, PPTX

## Security

- ✅ All endpoints require JWT authentication
- ✅ Users can only access their own files
- ✅ File ownership verified on all operations
- ✅ Soft delete preserves data integrity
- ✅ GCS URLs are public (consider implementing signed URLs for private files)

## Best Practices

1. **File Size**: Keep files under 50MB for optimal performance
2. **Processing**: Set `processImmediately=true` only when needed
3. **Tagging**: Use consistent tags for better organization
4. **Cleanup**: Implement periodic cleanup of inactive files
5. **Monitoring**: Track storage usage with the `/stats` endpoint

## Troubleshooting

### Upload Fails
- Check file size (must be under 50MB)
- Verify GCS bucket permissions
- Ensure service account JSON key is valid

### Processing Fails
- Check RAG database connection
- Verify OpenAI API key
- Review `processingError` field in file record

### File Not Found
- Ensure user owns the file
- Check if file is active (not soft deleted)
- Verify fileId is correct

## Future Enhancements

- [ ] Signed URLs for private file access
- [ ] File versioning
- [ ] Batch file upload
- [ ] File sharing between users
- [ ] Advanced search with filters
- [ ] File preview/thumbnail generation
- [ ] Automatic file categorization
- [ ] Storage quota management

## API Documentation

For detailed API documentation, see [KNOWLEDGE_BANK_API.md](../../docs/KNOWLEDGE_BANK_API.md)

## Related Modules

- **knowledgebase**: Bot-specific knowledge bases
- **RAG System**: Document processing and semantic search
- **conversations**: Chat with processed documents

## License

Proprietary - ASON Core Service Backend
